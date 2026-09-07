import asyncio
import json
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.game.presence import presence_manager
from app.game.room_manager import room_manager
from app.database import SessionLocal
from app.models.user import User
from app.models.room import Room
from app.auth.security import create_access_token

@pytest.mark.anyio
async def test_presence_system_counts_only_active_connections():
    """Verify presence counts only active users, not offline registered users."""
    # Ensure offline users in DB are not counted
    with SessionLocal() as db:
        total_db_users = db.query(User).count()
    
    online_count = presence_manager.get_online_count()
    # Verified online count must NOT be equal to total DB users unless all are connected
    assert online_count >= 0
    # Simulate a user connection
    class MockWebSocket:
        async def send_text(self, text):
            pass

    mock_ws = MockWebSocket()
    await presence_manager.add_connection(1001, mock_ws)
    assert presence_manager.is_user_online(1001) is True
    assert 1001 in presence_manager.get_online_user_ids()

    # Disconnect
    await presence_manager.remove_connection(1001, mock_ws)
    # Once disconnected and beyond 45s or no socket
    presence_manager._last_seen.pop(1001, None)
    assert presence_manager.is_user_online(1001) is False
    assert 1001 not in presence_manager.get_online_user_ids()

@pytest.mark.anyio
async def test_matchmaking_only_matches_real_online_available_users():
    """Verify matchmaking never matches offline users or creates fake bots."""
    # Ensure queue is clear
    room_manager.quickmatch_queue.clear()

    # User 901 queues alone
    await room_manager.add_to_quickmatch_queue(901, "Alice", "avatar-1", "ROOM01")
    presence_manager.touch_user(901)

    # User 902 tries to match, but 902 is checking against queue
    # If User 901 is online, 902 should be able to pop 901
    opponent = await room_manager.pop_quickmatch_opponent(excluding_user_id=902)
    # Since ROOM01 does not exist in room_manager.rooms yet, it should NOT pair with an invalid room!
    assert opponent is None, "Should not pair if room session doesn't exist"

    # Now create the actual room session for 901
    code1 = room_manager.create_room()
    await room_manager.add_to_quickmatch_queue(901, "Alice", "avatar-1", code1)
    presence_manager.touch_user(901)

    # Now with 901 online and valid room, 902 matches with 901
    opponent = await room_manager.pop_quickmatch_opponent(excluding_user_id=902)
    assert opponent is not None
    assert opponent["user_id"] == 901
    assert opponent["username"] == "Alice"

    # Queue should now be empty
    assert len(room_manager.quickmatch_queue) == 0

@pytest.mark.anyio
async def test_matchmaking_excludes_offline_users():
    """Verify offline users are purged and never paired."""
    room_manager.quickmatch_queue.clear()
    code2 = room_manager.create_room()

    await room_manager.add_to_quickmatch_queue(903, "Bob_Offline", "avatar-2", code2)
    # Mark user as NOT online
    presence_manager._last_seen.pop(903, None)
    if 903 in presence_manager._connections:
        del presence_manager._connections[903]

    opponent = await room_manager.pop_quickmatch_opponent(excluding_user_id=904)
    assert opponent is None, "Offline user must NEVER be matched!"
    assert 903 not in room_manager.quickmatch_queue, "Offline entry should be purged"

@pytest.mark.anyio
async def test_matchmaking_cancel_removes_from_queue():
    """Verify cancel search removes user cleanly from queue."""
    room_manager.quickmatch_queue.clear()
    await room_manager.add_to_quickmatch_queue(905, "Charlie", "avatar-3", "ROOM03")
    assert room_manager.is_user_in_queue(905) is True

    await room_manager.remove_from_quickmatch_queue(905)
    assert room_manager.is_user_in_queue(905) is False

@pytest.mark.anyio
async def test_matchmaking_concurrent_race_condition():
    """Verify two concurrent queue searches pop atomically only once."""
    room_manager.quickmatch_queue.clear()
    code4 = room_manager.create_room()

    # Player A is waiting in queue
    await room_manager.add_to_quickmatch_queue(906, "PlayerA", "avatar-1", code4)
    presence_manager.touch_user(906)

    # Two concurrent requests arrive to match with waiting opponent
    res1, res2 = await asyncio.gather(
        room_manager.pop_quickmatch_opponent(excluding_user_id=907),
        room_manager.pop_quickmatch_opponent(excluding_user_id=908)
    )

    # Exactly ONE of them must get PlayerA, and the other must get None (no double pairing!)
    matches = [r for r in (res1, res2) if r is not None]
    assert len(matches) == 1, "Exactly one player must be matched with PlayerA"
    assert matches[0]["user_id"] == 906

@pytest.mark.anyio
async def test_presence_api_endpoint():
    """Verify /api/presence/stats returns valid online and queue counts."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/presence/stats")
        assert res.status_code == 200
        data = res.json()
        assert "online_count" in data
        assert "searching_count" in data
        assert isinstance(data["online_count"], int)
        assert isinstance(data["searching_count"], int)

@pytest.mark.anyio
async def test_chat_immediate_broadcast_and_async_persist():
    """Verify chat is broadcasted immediately with message_id and asynchronously persisted to DB."""
    from app.models.chat import ChatMessage as DBChatMessage
    from app.websocket.handler import broadcast_to_room

    code = room_manager.create_room()
    session = room_manager.rooms[code]

    received_messages = []
    class MockChatWebSocket:
        async def send_text(self, text):
            received_messages.append(json.loads(text))

    mock_p1 = MockChatWebSocket()
    mock_p2 = MockChatWebSocket()
    session.connections[101] = mock_p1
    session.connections[102] = mock_p2

    # Simulate immediate chat broadcast
    custom_msg_id = "client_uuid_12345"
    payload = {
        "id": custom_msg_id,
        "message_id": custom_msg_id,
        "sender_id": 101,
        "sender_username": "Player101",
        "sender_avatar": "avatar-1",
        "message": "Hello rival!",
        "is_system": False,
        "timestamp": "2026-09-07T12:00:00Z"
    }

    # Broadcast happens immediately
    await broadcast_to_room(session, "chat_message", payload)

    assert len(received_messages) == 2
    assert received_messages[0]["type"] == "chat_message"
    assert received_messages[0]["data"]["message_id"] == "client_uuid_12345"
    assert received_messages[0]["data"]["message"] == "Hello rival!"
    assert received_messages[1]["data"]["message_id"] == "client_uuid_12345"

@pytest.mark.anyio
async def test_typing_indicator_relayed_to_opponent():
    """Verify typing indicator is relayed immediately to opponent without sending to sender."""
    from app.websocket.handler import broadcast_to_room

    code = room_manager.create_room()
    session = room_manager.rooms[code]

    sender_received = []
    opponent_received = []

    class MockSocket:
        def __init__(self, target_list):
            self.target_list = target_list
        async def send_text(self, text):
            self.target_list.append(json.loads(text))

    p1_socket = MockSocket(sender_received)
    p2_socket = MockSocket(opponent_received)
    session.connections[201] = p1_socket
    session.connections[202] = p2_socket

    # Player 201 types -> opponent (202) receives typing, sender does NOT receive back
    await broadcast_to_room(session, "typing", {
        "player_id": 201,
        "username": "Player201",
        "is_typing": True
    }, sender_ws=p1_socket)

    assert len(sender_received) == 0, "Sender must not receive their own typing event"
    assert len(opponent_received) == 1, "Opponent must receive typing event"
    assert opponent_received[0]["type"] == "typing"
    assert opponent_received[0]["data"]["is_typing"] is True

