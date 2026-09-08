import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_auth_register_and_login():
    # Register user 1
    u1_payload = {
        "username": "TestPlayerOne",
        "email": "player1@test.com",
        "password": "Password123!"
    }
    res = client.post("/api/auth/register", json=u1_payload)
    if res.status_code == 400:  # already exists from previous run
        pass
    else:
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["user"]["username"] == "TestPlayerOne"

    # Login user 1
    login_payload = {
        "username_or_email": "TestPlayerOne",
        "password": "Password123!"
    }
    res = client.post("/api/auth/login", json=login_payload)
    assert res.status_code == 200
    token1 = res.json()["access_token"]
    assert token1 is not None

    # Register user 2
    u2_payload = {
        "username": "TestPlayerTwo",
        "email": "player2@test.com",
        "password": "Password123!"
    }
    res2 = client.post("/api/auth/register", json=u2_payload)
    login2_payload = {
        "username_or_email": "TestPlayerTwo",
        "password": "Password123!"
    }
    res2 = client.post("/api/auth/login", json=login2_payload)
    token2 = res2.json()["access_token"]

    # Create Room with Player 1
    headers1 = {"Authorization": f"Bearer {token1}"}
    create_res = client.post("/api/rooms", json={"allow_custom_words": True}, headers=headers1)
    assert create_res.status_code == 200
    room_data = create_res.json()
    room_code = room_data["room_code"]
    assert len(room_code) == 6

    # Join Room with Player 2
    headers2 = {"Authorization": f"Bearer {token2}"}
    join_res = client.post("/api/rooms/join", json={"room_code": room_code}, headers=headers2)
    assert join_res.status_code == 200
    joined_data = join_res.json()
    assert joined_data["player2_id"] is not None

    # Try to join with a 3rd player -> MUST FAIL (room is full)
    u3_payload = {
        "username": "TestPlayerThree",
        "email": "player3@test.com",
        "password": "Password123!"
    }
    client.post("/api/auth/register", json=u3_payload)
    login3 = client.post("/api/auth/login", json={"username_or_email": "TestPlayerThree", "password": "Password123!"})
    token3 = login3.json()["access_token"]
    join_full = client.post("/api/rooms/join", json={"room_code": room_code}, headers={"Authorization": f"Bearer {token3}"})
    assert join_full.status_code == 400
    assert "room is full" in join_full.json()["detail"].lower()

def test_leaderboard():
    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
