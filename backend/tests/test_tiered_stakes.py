import pytest
import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.room import Room
from app.game.room_manager import room_manager, ARENA_TIERS

client = TestClient(app)

def create_test_user(username_prefix: str, coins: int = 500, level: int = 1):
    timestamp = int(datetime.datetime.now().timestamp() * 1000)
    username = f"{username_prefix}_{timestamp}"
    email = f"{username}@test.com"
    reg = client.post("/api/auth/register", json={
        "username": username,
        "email": email,
        "password": "Password123!"
    })
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    user_id = reg.json()["user"]["id"]

    with SessionLocal() as db:
        u = db.query(User).filter(User.id == user_id).first()
        u.coins = coins
        u.level = level
        db.commit()

    return token, user_id

def test_room_creation_level_and_coin_gates():
    # User 1: Level 1 with 500 coins
    token1, u1_id = create_test_user("lvl1_duelist", coins=500, level=1)
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 1. 50 Coins room (Level 1 required) -> SUCCEEDS
    res50 = client.post("/api/rooms", json={"allow_custom_words": True, "entry_fee": 50}, headers=headers1)
    assert res50.status_code == 200
    assert res50.json()["entry_fee"] == 50

    # 2. 100 Coins room (Level 2 required) -> FAILS (Level 1 user)
    res100 = client.post("/api/rooms", json={"allow_custom_words": True, "entry_fee": 100}, headers=headers1)
    assert res100.status_code == 400
    assert "level 2" in res100.json()["detail"].lower()

    # User 2: Level 10 with only 40 coins
    token2, u2_id = create_test_user("poor_master", coins=40, level=10)
    headers2 = {"Authorization": f"Bearer {token2}"}

    # 3. 50 Coins room -> FAILS (Insufficient coins)
    res_poor = client.post("/api/rooms", json={"allow_custom_words": True, "entry_fee": 50}, headers=headers2)
    assert res_poor.status_code == 400
    assert "insufficient coins" in res_poor.json()["detail"].lower()

def test_room_join_level_and_coin_gates():
    # Host: Level 3, 1000 coins -> Creates 200 coins room
    host_token, host_id = create_test_user("host_tier3", coins=1000, level=3)
    create_res = client.post("/api/rooms", json={"allow_custom_words": True, "entry_fee": 200}, headers={"Authorization": f"Bearer {host_token}"})
    assert create_res.status_code == 200
    code = create_res.json()["room_code"]

    # Guest 1: Level 1, 500 coins -> Tries to join -> FAILS (Requires Level 3)
    g1_token, _ = create_test_user("guest_low_lvl", coins=500, level=1)
    join_fail_lvl = client.post("/api/rooms/join", json={"room_code": code}, headers={"Authorization": f"Bearer {g1_token}"})
    assert join_fail_lvl.status_code == 400
    assert "level 3" in join_fail_lvl.json()["detail"].lower()

    # Guest 2: Level 3, but only 150 coins -> Tries to join -> FAILS (Insufficient coins)
    g2_token, _ = create_test_user("guest_low_coins", coins=150, level=3)
    join_fail_coins = client.post("/api/rooms/join", json={"room_code": code}, headers={"Authorization": f"Bearer {g2_token}"})
    assert join_fail_coins.status_code == 400
    assert "insufficient coins" in join_fail_coins.json()["detail"].lower()

    # Guest 3: Level 3, 500 coins -> Tries to join -> SUCCEEDS
    g3_token, _ = create_test_user("guest_valid", coins=500, level=3)
    join_ok = client.post("/api/rooms/join", json={"room_code": code}, headers={"Authorization": f"Bearer {g3_token}"})
    assert join_ok.status_code == 200
    assert join_ok.json()["entry_fee"] == 200

def test_quickmatch_tier_isolation():
    # User A queues for 50 coins
    uA_token, uA_id = create_test_user("user_tier_50", coins=500, level=1)
    resA = client.post("/api/rooms/quickmatch", json={"entry_fee": 50}, headers={"Authorization": f"Bearer {uA_token}"})
    assert resA.status_code == 200
    assert resA.json()["matched"] is False

    # User B queues for 100 coins (Level 2)
    uB_token, uB_id = create_test_user("user_tier_100", coins=500, level=2)
    resB = client.post("/api/rooms/quickmatch", json={"entry_fee": 100}, headers={"Authorization": f"Bearer {uB_token}"})
    assert resB.status_code == 200
    # Must NOT match with User A (different stake tiers!)
    assert resB.json()["matched"] is False

    # User C queues for 100 coins (Level 2)
    uC_token, uC_id = create_test_user("user_tier_100_c", coins=500, level=2)
    resC = client.post("/api/rooms/quickmatch", json={"entry_fee": 100}, headers={"Authorization": f"Bearer {uC_token}"})
    assert resC.status_code == 200
    # User C MUST match with User B (same 100-coin tier)
    assert resC.json()["matched"] is True
    assert resC.json()["room_code"] == resB.json()["room_code"]

def test_match_settlement_coin_win_loss():
    from app.game.engine import LetterDuelGame
    from app.websocket.handler import persist_game_end_to_db

    # Create Winner (500 coins) and Loser (500 coins)
    w_token, w_id = create_test_user("winner_settle", coins=500, level=2)
    l_token, l_id = create_test_user("loser_settle", coins=500, level=2)

    # 100-coin stake match
    entry_fee = 100
    code = room_manager.create_room(allow_custom_words=True, is_private=True, entry_fee=entry_fee)
    session = room_manager.get_room(code)

    game = LetterDuelGame(room_code=code, player1_id=w_id, player1_username="Winner", allow_custom_words=True)
    game.add_player2(l_id, "Loser")
    game.state = "WORD_SELECTION"
    game.lock_word(w_id, "APPLE")
    game.lock_word(l_id, "BERRY")
    session.game = game

    # Winner guesses full word 'BERRY' -> Instant win
    ok, data, msg = game.guess_full_word(w_id, "BERRY")
    assert ok is True
    assert game.state == "GAME_OVER"
    assert game.winner_id == w_id

    # Settle match in DB
    with SessionLocal() as db:
        persist_game_end_to_db(session, db)
        
        # Check Winner coins: 500 + 100 = 600
        winner = db.query(User).filter(User.id == w_id).first()
        assert winner.coins == 600

        # Check Loser coins: 500 - 100 = 400
        loser = db.query(User).filter(User.id == l_id).first()
        assert loser.coins == 400

        # Check rewards payload
        rewards = session.game.rewards
        assert rewards["entry_fee"] == 100
        assert rewards["pot"] == 200
        assert rewards["winner_coins_won"] == 100
        assert rewards["loser_coins_lost"] == 100
