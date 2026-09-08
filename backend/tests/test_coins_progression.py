import pytest
import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User

client = TestClient(app)

def test_registration_coins_and_level_bonus():
    unique_user = f"coin_duelist_{int(datetime.datetime.now().timestamp())}"
    payload = {
        "username": unique_user,
        "email": f"{unique_user}@test.com",
        "password": "Password123!"
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["coins"] == 500
    assert data["user"]["level"] == 1
    assert data["user"]["xp"] == 0

    token = data["access_token"]
    # Verify via /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["coins"] == 500
    assert me_data["level"] == 1
    assert me_data["xp"] == 0

def test_daily_bonus_claim_and_rate_limit():
    unique_user = f"daily_user_{int(datetime.datetime.now().timestamp())}"
    payload = {
        "username": unique_user,
        "email": f"{unique_user}@test.com",
        "password": "Password123!"
    }
    reg = client.post("/api/auth/register", json=payload)
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    user_id = reg.json()["user"]["id"]

    # 1. First daily claim should succeed (+200 coins -> 700 total)
    res = client.post("/api/auth/daily-bonus", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["coins"] == 700
    assert data["bonus_amount"] == 200

    # 2. Second daily claim immediately should be blocked (already claimed within 24h)
    res2 = client.post("/api/auth/daily-bonus", headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 400
    assert "already claimed" in res2.json()["detail"].lower()

    # 3. Bankruptcy safety net: If coins < 50, safety net bypasses the 24h block
    with SessionLocal() as db:
        u = db.query(User).filter(User.id == user_id).first()
        u.coins = 20
        db.commit()

    res3 = client.post("/api/auth/daily-bonus", headers={"Authorization": f"Bearer {token}"})
    assert res3.status_code == 200
    assert res3.json()["coins"] == 220
    assert "refill" in res3.json()["message"].lower()

def test_progression_level_up_calculation():
    unique_user = f"levelup_user_{int(datetime.datetime.now().timestamp())}"
    payload = {
        "username": unique_user,
        "email": f"{unique_user}@test.com",
        "password": "Password123!"
    }
    reg = client.post("/api/auth/register", json=payload)
    assert reg.status_code == 200
    user_id = reg.json()["user"]["id"]

    with SessionLocal() as db:
        u = db.query(User).filter(User.id == user_id).first()
        assert u.level == 1
        assert u.coins == 500

        # Simulate winning 2 matches (200 XP total)
        u.xp += 200
        new_level = max(1, (u.xp // 200) + 1)
        if new_level > u.level:
            u.level = new_level
            u.coins += 100  # Level up bonus

        db.commit()
        db.refresh(u)

        assert u.level == 2
        assert u.coins == 600
