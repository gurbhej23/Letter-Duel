import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.game.room_manager import room_manager, UserMatchState
from app.game.engine import LetterDuelGame, BOT_USER_ID, BOT_USERNAME

client = TestClient(app)

@pytest.fixture
def test_user_token():
    unique_id = 8899
    username = f"MatchUser_{unique_id}"
    email = f"matchuser_{unique_id}@test.com"
    password = "Password123!"

    reg_res = client.post("/api/auth/register", json={
        "username": username,
        "email": email,
        "password": password
    })
    if reg_res.status_code == 200:
        return reg_res.json()["access_token"], reg_res.json()["user"]["id"]

    login_res = client.post("/api/auth/login", json={
        "username_or_email": username,
        "password": password
    })
    assert login_res.status_code == 200
    return login_res.json()["access_token"], login_res.json()["user"]["id"]

def test_bot_match_creation(test_user_token):
    token, user_id = test_user_token
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/rooms/bot", json={"entry_fee": 10, "difficulty": "hard"}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["matched"] is True
    assert data["is_bot"] is True
    assert data["difficulty"] == "hard"
    assert data["opponent"]["id"] == BOT_USER_ID
    assert data["opponent"]["username"].startswith(BOT_USERNAME)

    room_code = data["room_code"]
    session = room_manager.get_room(room_code)
    assert session is not None
    assert session.is_bot_opponent is True
    assert session.bot_difficulty == "hard"

    # Verify game state views
    engine = session.game
    assert engine is not None
    assert engine.is_bot_opponent is True
    assert engine.bot_difficulty == "hard"
    assert BOT_USER_ID in engine.secret_words
    assert len(engine.secret_words[BOT_USER_ID]) >= 3

    # CRITICAL: Secret word must NOT be exposed in player view!
    player_view = engine.get_player_view(user_id)
    assert player_view["opponent_secret_word"] is None
    assert player_view["is_bot_opponent"] is True
    assert player_view["bot_difficulty"] == "hard"

def test_active_match_endpoint(test_user_token):
    token, user_id = test_user_token
    headers = {"Authorization": f"Bearer {token}"}

    # Cancel / leave any leftover active room from previous test
    client.post("/api/rooms/leave", json={}, headers=headers)
    client.post("/api/rooms/quickmatch/cancel", headers=headers)
    room_manager.set_user_state(user_id, UserMatchState.AVAILABLE, None)

    res = client.get("/api/game/active", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["active"] is False

    # Start a bot duel
    bot_res = client.post("/api/rooms/bot", json={"entry_fee": 10, "difficulty": "normal"}, headers=headers)
    assert bot_res.status_code == 200
    room_code = bot_res.json()["room_code"]

    # Now verify active match endpoint detects it
    active_res = client.get("/api/game/active", headers=headers)
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["active"] is True
    assert active_data["room_code"] == room_code
    assert active_data["can_rejoin"] is True
    assert active_data["is_bot"] is True
    assert active_data["opponent"]["username"] == BOT_USERNAME
    assert "secret_word" not in active_data["opponent"]

    # Cleanup
    client.post("/api/rooms/quickmatch/cancel", headers=headers)

def test_consecutive_quickmatch_attempts(test_user_token):
    token, user_id = test_user_token
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt 1: Queue and Cancel
    res1 = client.post("/api/rooms/quickmatch", json={"entry_fee": 10}, headers=headers)
    assert res1.status_code == 200
    data1 = res1.json()
    assert "room_code" in data1
    assert room_manager.get_user_state(user_id) in (UserMatchState.SEARCHING, UserMatchState.IN_ROOM)

    cancel1 = client.post("/api/rooms/quickmatch/cancel", headers=headers)
    assert cancel1.status_code == 200
    assert room_manager.get_user_state(user_id) == UserMatchState.AVAILABLE

    # Attempt 2: Queue immediately again (reproducing original bug where 2nd attempt failed)
    res2 = client.post("/api/rooms/quickmatch", json={"entry_fee": 10}, headers=headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert "room_code" in data2
    assert room_manager.get_user_state(user_id) in (UserMatchState.SEARCHING, UserMatchState.IN_ROOM)

    cancel2 = client.post("/api/rooms/quickmatch/cancel", headers=headers)
    assert cancel2.status_code == 200
    assert room_manager.get_user_state(user_id) == UserMatchState.AVAILABLE

    # Attempt 3: Queue a third time
    res3 = client.post("/api/rooms/quickmatch", json={"entry_fee": 10}, headers=headers)
    assert res3.status_code == 200
    data3 = res3.json()
    assert "room_code" in data3
    assert room_manager.get_user_state(user_id) in (UserMatchState.SEARCHING, UserMatchState.IN_ROOM)

    cancel3 = client.post("/api/rooms/quickmatch/cancel", headers=headers)
    assert cancel3.status_code == 200
    assert room_manager.get_user_state(user_id) == UserMatchState.AVAILABLE

def test_bot_ai_turn_never_repeats_guesses():
    # Unit test engine bot guess behavior
    engine = LetterDuelGame(
        room_code="TESTBOT",
        player1_id=1001,
        player2_id=BOT_USER_ID,
        player1_username="PlayerHuman",
        player2_username=BOT_USERNAME,
        bot_difficulty="normal"
    )
    engine.is_bot_opponent = True
    engine.bot_difficulty = "normal"
    engine.state = "WORD_SELECTION"
    engine.lock_word(1001, "PLANET")
    # Bot has auto-selected a word
    assert BOT_USER_ID in engine.secret_words
    assert engine.state == "PLAYING"

    # Human guesses
    engine.guess_letter(1001, 'E')
    assert engine.current_turn_player_id == BOT_USER_ID

    # Bot should pick a valid letter that has not been guessed yet
    from app.websocket.handler import pick_bot_letter
    letter = pick_bot_letter(engine, "normal")
    assert letter is not None
    assert letter.upper() in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    assert letter.upper() not in engine.guessed_letters.get(BOT_USER_ID, [])
