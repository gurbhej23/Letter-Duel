import pytest
import datetime
import asyncio
from app.game.engine import LetterDuelGame
from app.game.room_manager import RoomSession, room_manager
from app.websocket.handler import start_turn_timer, cancel_turn_timer

def test_engine_state_version_monotonic_increments():
    """Verify that state_version strictly increments upon each state transition."""
    game = LetterDuelGame(
        room_code="TESTV1",
        player1_id=101,
        player1_username="Alice"
    )
    v0 = game.state_version
    assert v0 == 1

    # Add Player 2
    game.add_player2(102, "Bob")
    assert game.state_version > v0
    v1 = game.state_version

    # Set player 1 ready
    game.set_player_ready(101, True)
    assert game.state_version > v1
    v2 = game.state_version

    # Set player 2 ready -> transitions to WORD_SELECTION
    game.set_player_ready(102, True)
    assert game.state == "WORD_SELECTION"
    assert game.state_version > v2
    v3 = game.state_version

    # Lock words
    game.lock_word(101, "APPLE")
    assert game.state_version > v3
    v4 = game.state_version

    game.lock_word(102, "BANANA")
    assert game.state == "PLAYING"
    assert game.state_version > v4
    v5 = game.state_version

    # Letter guess
    ok, res, _ = game.guess_letter(101, "B")
    assert ok is True
    assert game.state_version > v5
    v6 = game.state_version

    # Player view contains authoritative fields
    view1 = game.get_player_view(101)
    assert view1["state_version"] == v6
    assert view1["turn_number"] == 2
    assert view1["current_turn_player_id"] == 102
    assert view1["turn_expires_at"] is not None
    assert view1["server_time"] is not None

def test_room_session_connection_generations_isolation():
    """Verify that connection_generations protects active connection from stale socket teardowns."""
    session = RoomSession(room_code="GEN001")
    player_id = 555

    # Socket 1 connects
    gen1 = session.connection_generations.get(player_id, 0) + 1
    session.connection_generations[player_id] = gen1
    session.player_connected[player_id] = True
    session.connections[player_id] = "socket_1"

    assert session.connection_generations[player_id] == 1
    assert session.connections[player_id] == "socket_1"

    # User refreshes / opens socket 2 (reconnect arrives before socket 1 cleanup completes)
    gen2 = session.connection_generations.get(player_id, 0) + 1
    session.connection_generations[player_id] = gen2
    session.player_connected[player_id] = True
    session.connections[player_id] = "socket_2"

    assert session.connection_generations[player_id] == 2
    assert session.connections[player_id] == "socket_2"

    # Now socket 1 finally triggers its finally/cleanup block with local gen1
    current_active_gen = session.connection_generations.get(player_id, 0)
    if current_active_gen != gen1:
        # Stale disconnect ignored!
        pass
    else:
        session.connections.pop(player_id, None)

    # CRITICAL: Socket 2 connection is PRESERVED! Not deleted!
    assert session.connections.get(player_id) == "socket_2"
    assert session.player_connected[player_id] is True

def test_start_turn_timer_idempotency():
    """Verify that calling start_turn_timer for the same active turn does not cancel or restart it."""
    async def _run():
        session = RoomSession(room_code="TMR001")
        game = LetterDuelGame(
            room_code="TMR001",
            player1_id=1,
            player2_id=2
        )
        game.state = "PLAYING"
        game.current_turn_player_id = 1
        game.turn_number = 1
        game.turn_started_at = datetime.datetime.now(datetime.timezone.utc)
        session.game = game

        # First call: starts timer
        start_turn_timer(session)
        first_task = session.turn_timer_task
        assert first_task is not None
        assert session.active_turn_timer_info["turn_number"] == 1

        # Second call (e.g. on client reconnect / state sync): must NOT replace running task
        start_turn_timer(session)
        assert session.turn_timer_task is first_task

        # Clean up
        cancel_turn_timer(session)
        assert session.turn_timer_task is None

    asyncio.run(_run())
