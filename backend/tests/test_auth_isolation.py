import datetime
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth.security import create_access_token
from app.models.user import User
from app.database import SessionLocal

client = TestClient(app)

def unique_user_payload(prefix: str):
    ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
    return {
        "username": f"{prefix}_{ts}",
        "email": f"{prefix}_{ts}@dueltest.com",
        "password": "SecurePassword123!"
    }

def test_multi_user_authentication_isolation():
    """
    TEST 1-4: Verify multi-user session isolation.
    User A and User B maintain distinct identities and cannot read each other's account.
    """
    # 1. Register and login User A
    uA = unique_user_payload("UserA")
    res_reg_a = client.post("/api/auth/register", json=uA)
    assert res_reg_a.status_code == 200
    token_a = res_reg_a.json()["access_token"]
    user_a_id = res_reg_a.json()["user"]["id"]

    # 2. Register and login User B
    uB = unique_user_payload("UserB")
    res_reg_b = client.post("/api/auth/register", json=uB)
    assert res_reg_b.status_code == 200
    token_b = res_reg_b.json()["access_token"]
    user_b_id = res_reg_b.json()["user"]["id"]

    # User IDs must be distinct
    assert user_a_id != user_b_id

    # TEST 1: User A's token returns User A
    res_me_a = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_a}"})
    assert res_me_a.status_code == 200
    data_a = res_me_a.json()
    assert data_a["id"] == user_a_id
    assert data_a["username"] == uA["username"]
    assert data_a["email"] == uA["email"].lower()

    # TEST 2: User B's token returns User B
    res_me_b = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_b}"})
    assert res_me_b.status_code == 200
    data_b = res_me_b.json()
    assert data_b["id"] == user_b_id
    assert data_b["username"] == uB["username"]
    assert data_b["email"] == uB["email"].lower()

    # TEST 3: User A's token NEVER returns User B
    assert data_a["id"] != user_b_id
    assert data_a["username"] != uB["username"]

    # TEST 4: User B's token NEVER returns User A
    assert data_b["id"] != user_a_id
    assert data_b["username"] != uA["username"]

def test_invalid_and_expired_tokens():
    """
    TEST 5-8: Verify invalid, expired, missing, and non-existent user tokens return HTTP 401.
    """
    # TEST 5: Malformed token -> HTTP 401
    res_malformed = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-valid-token"})
    assert res_malformed.status_code == 401
    assert "WWW-Authenticate" in res_malformed.headers

    # TEST 6: Expired token -> HTTP 401
    expired_token = create_access_token(
        {"sub": "1"},
        expires_delta=datetime.timedelta(seconds=-60)
    )
    res_expired = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res_expired.status_code == 401
    assert "WWW-Authenticate" in res_expired.headers

    # TEST 7: Token with non-existent user ID -> HTTP 401 (Never 404 or 500)
    ghost_token = create_access_token({"sub": "999999999"})
    res_ghost = client.get("/api/auth/me", headers={"Authorization": f"Bearer {ghost_token}"})
    assert res_ghost.status_code == 401
    assert "WWW-Authenticate" in res_ghost.headers

    # TEST 8: Missing Authorization header -> HTTP 401
    res_missing = client.get("/api/auth/me")
    assert res_missing.status_code == 401
    assert "WWW-Authenticate" in res_missing.headers

def test_anti_caching_headers_on_auth_me():
    """
    TEST 9: GET /api/auth/me must return strict anti-caching headers so CDNs/proxies never cache user identity.
    """
    u = unique_user_payload("CacheTest")
    res_reg = client.post("/api/auth/register", json=u)
    token = res_reg.json()["access_token"]

    res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200

    cache_ctrl = res_me.headers.get("Cache-Control", "")
    assert "no-store" in cache_ctrl
    assert "no-cache" in cache_ctrl
    assert "must-revalidate" in cache_ctrl
    assert res_me.headers.get("Pragma") == "no-cache"
    assert res_me.headers.get("Expires") == "0"

def test_websocket_authentication_rejection():
    """
    TEST 10: WebSocket endpoint rejects connection when token is invalid or missing.
    """
    # Create a room first
    u = unique_user_payload("WsHost")
    res_reg = client.post("/api/auth/register", json=u)
    token = res_reg.json()["access_token"]
    res_room = client.post("/api/rooms", json={"allow_custom_words": True}, headers={"Authorization": f"Bearer {token}"})
    assert res_room.status_code == 200
    room_code = res_room.json()["room_code"]

    # Connect with invalid token
    with client.websocket_connect(f"/ws/room/{room_code}?token=invalid_ws_token") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "invalid" in msg["data"]["message"].lower() or "token" in msg["data"]["message"].lower()

def test_cors_preflight_for_ngrok_and_vercel():
    """
    Verify preflight OPTIONS requests for ngrok tunnels and Vercel are accepted
    and return proper Access-Control headers.
    """
    origins_to_test = [
        "https://onscreen-twister-habitat.ngrok-free.dev",
        "https://random-subdomain.ngrok-free.dev",
        "https://random-subdomain.ngrok-free.app",
        "https://random-subdomain.ngrok.io",
        "https://letterguessword.vercel.app",
        "https://preview-123.vercel.app"
    ]

    for origin in origins_to_test:
        res = client.options(
            "/api/auth/register",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type"
            }
        )
        assert res.status_code == 200, f"Preflight failed for {origin}"
        assert res.headers.get("access-control-allow-origin") == origin
        assert res.headers.get("access-control-allow-credentials") == "true"

        res_friends = client.options(
            "/api/friends/invites",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type"
            }
        )
        assert res_friends.status_code == 200, f"Preflight failed for {origin} on /api/friends/invites"
        assert res_friends.headers.get("access-control-allow-origin") == origin
