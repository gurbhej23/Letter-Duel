import pytest
import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.tournament import Tournament, TournamentParticipant, TournamentMatch
from app.game.tournament_manager import tournament_manager

client = TestClient(app)

def create_test_user(db, username: str, email: str):
    u = db.query(User).filter(User.username == username).first()
    if not u:
        u = User(
            username=username,
            email=email,
            password_hash="testpasshash",
            coins=500,
            level=1,
            xp=0
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u

@pytest.fixture
def auth_tokens():
    """Generates auth tokens for 9 test players."""
    tokens = {}
    db = SessionLocal()
    for i in range(1, 10):
        uname = f"TourneyUser{i}_{int(datetime.datetime.now().timestamp())}"
        email = f"tourney{i}_{int(datetime.datetime.now().timestamp())}@test.com"
        u = create_test_user(db, uname, email)
        from app.auth.security import create_access_token
        token = create_access_token(data={"sub": str(u.id)})
        tokens[i] = {"token": token, "user": u}
    db.close()
    return tokens

def test_tournament_active_and_join_queue(auth_tokens):
    p1 = auth_tokens[1]
    headers1 = {"Authorization": f"Bearer {p1['token']}"}

    # 1. Fetch active tournament
    res = client.get("/api/tournaments/active", headers=headers1)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("WAITING", "IN_PROGRESS")
    tourney_id = data["id"]

    # 2. Join queue
    if data["status"] == "WAITING":
        join_res = client.post(f"/api/tournaments/{tourney_id}/join", headers=headers1)
        # Should succeed or report already joined
        assert join_res.status_code in (200, 400)
        if join_res.status_code == 200:
            assert join_res.json()["current_players"] >= 1

def test_tournament_full_flow_8_players():
    db = SessionLocal()
    import time
    ts = int(time.time() * 1000)

    # 1. Create 9 fresh users
    fresh_players = {}
    from app.auth.security import create_access_token
    for i in range(1, 10):
        uname = f"FlowUser{i}_{ts}"
        email = f"flow{i}_{ts}@test.com"
        u = create_test_user(db, uname, email)
        token = create_access_token(data={"sub": str(u.id)})
        fresh_players[i] = {"token": token, "user": u}

    # Create an isolated waiting tournament
    tourney = Tournament(
        name="Test 8-Player Cup",
        status="WAITING",
        max_players=8,
        current_players=0
    )
    db.add(tourney)
    db.commit()
    db.refresh(tourney)

    # 8 players join sequentially
    for i in range(1, 9):
        p = fresh_players[i]
        headers = {"Authorization": f"Bearer {p['token']}"}
        res = client.post(f"/api/tournaments/{tourney.id}/join", headers=headers)
        assert res.status_code == 200, f"Player {i} failed to join: {res.json()}"
        d = res.json()
        if i < 8:
            assert d["status"] == "WAITING"
            assert d["current_players"] == i
        else:
            # 8th player triggers auto-start!
            assert d["status"] == "IN_PROGRESS"
            assert len(d["matches"]) == 7

    # 9th player attempts to join -> MUST FAIL (tournament full)
    p9 = fresh_players[9]
    res9 = client.post(f"/api/tournaments/{tourney.id}/join", headers={"Authorization": f"Bearer {p9['token']}"})
    assert res9.status_code == 400
    assert "already" in res9.json()["detail"].lower() or "full" in res9.json()["detail"].lower()

    # Verify bracket structure
    db.refresh(tourney)
    matches = tourney.matches
    assert len(matches) == 7

    # 4 Quarterfinals (Round 1)
    qfs = [m for m in matches if m.round == 1]
    assert len(qfs) == 4
    for qf in qfs:
        assert qf.status == "READY"
        assert qf.player1_id is not None
        assert qf.player2_id is not None
        assert qf.room_code is not None

    # 2 Semifinals (Round 2)
    sfs = [m for m in matches if m.round == 2]
    assert len(sfs) == 2
    for sf in sfs:
        assert sf.status == "LOCKED"

    # 1 Final (Round 3)
    finals = [m for m in matches if m.round == 3]
    assert len(finals) == 1
    assert finals[0].status == "LOCKED"

    # Simulate QF1 win: player1 wins QF1
    qf1 = qfs[0]
    w_id = qf1.player1_id
    l_id = qf1.player2_id
    
    import asyncio
    asyncio.run(tournament_manager.on_game_finished(qf1.room_code, w_id, l_id, db))

    db.refresh(tourney)
    # Check loser eliminated and rewarded
    loser_p = db.query(TournamentParticipant).filter(TournamentParticipant.tournament_id == tourney.id, TournamentParticipant.user_id == l_id).first()
    assert loser_p.eliminated is True
    assert loser_p.placement == 5  # Quarterfinalist
    assert loser_p.coins_awarded == 50
    assert loser_p.xp_awarded == 100

    # Simulate QF2 win: player1 wins QF2 -> Semifinal 1 becomes READY!
    qf2 = qfs[1]
    w2_id = qf2.player1_id
    l2_id = qf2.player2_id
    asyncio.run(tournament_manager.on_game_finished(qf2.room_code, w2_id, l2_id, db))

    db.refresh(tourney)
    sf1 = [m for m in tourney.matches if m.round == 2 and m.match_number == 5][0]
    assert sf1.status == "READY"
    assert sf1.player1_id == w_id
    assert sf1.player2_id == w2_id
    assert sf1.room_code is not None

    # Simulate QF3 and QF4 wins -> SF2 becomes READY!
    qf3 = qfs[2]
    asyncio.run(tournament_manager.on_game_finished(qf3.room_code, qf3.player1_id, qf3.player2_id, db))
    qf4 = qfs[3]
    asyncio.run(tournament_manager.on_game_finished(qf4.room_code, qf4.player1_id, qf4.player2_id, db))

    db.refresh(tourney)
    sf2 = [m for m in tourney.matches if m.round == 2 and m.match_number == 6][0]
    assert sf2.status == "READY"

    # Simulate Semifinal 1 and 2 wins -> Final becomes READY!
    asyncio.run(tournament_manager.on_game_finished(sf1.room_code, sf1.player1_id, sf1.player2_id, db))
    asyncio.run(tournament_manager.on_game_finished(sf2.room_code, sf2.player1_id, sf2.player2_id, db))

    db.refresh(tourney)
    final = [m for m in tourney.matches if m.round == 3][0]
    assert final.status == "READY"
    assert final.player1_id is not None
    assert final.player2_id is not None
    assert final.room_code is not None

    # Simulate Final win -> Champion crowned!
    champ_id = final.player1_id
    runner_up_id = final.player2_id
    asyncio.run(tournament_manager.on_game_finished(final.room_code, champ_id, runner_up_id, db))

    db.refresh(tourney)
    assert tourney.status == "FINISHED"
    assert tourney.winner_id == champ_id

    champ_p = db.query(TournamentParticipant).filter(TournamentParticipant.tournament_id == tourney.id, TournamentParticipant.user_id == champ_id).first()
    assert champ_p.status == "CHAMPION"
    assert champ_p.placement == 1
    assert champ_p.coins_awarded == 250
    assert champ_p.xp_awarded == 500

    runner_p = db.query(TournamentParticipant).filter(TournamentParticipant.tournament_id == tourney.id, TournamentParticipant.user_id == runner_up_id).first()
    assert runner_p.placement == 2
    assert runner_p.coins_awarded == 150
    assert runner_p.xp_awarded == 350

    db.close()

def test_tournament_history_endpoint(auth_tokens):
    p1 = auth_tokens[1]
    headers1 = {"Authorization": f"Bearer {p1['token']}"}
    res = client.get("/api/tournaments/history", headers=headers1)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)

def test_tournament_leave_in_progress_auto_forfeit():
    """Verify that when a player leaves an in-progress tournament, their opponent automatically advances by forfeit."""
    db = SessionLocal()
    import time
    ts = int(time.time() * 1000)

    # 1. Create 8 players
    from app.auth.security import create_access_token
    players = {}
    for i in range(1, 9):
        u = create_test_user(db, f"ForfeitUser{i}_{ts}", f"forfeit{i}_{ts}@test.com")
        token = create_access_token(data={"sub": str(u.id)})
        players[i] = {"token": token, "user": u}

    # 2. Create and fill tournament
    tourney = Tournament(
        name="Auto-Forfeit Test Cup",
        status="WAITING",
        max_players=8,
        current_players=0
    )
    db.add(tourney)
    db.commit()
    db.refresh(tourney)

    for i in range(1, 9):
        p = players[i]
        res = client.post(f"/api/tournaments/{tourney.id}/join", headers={"Authorization": f"Bearer {p['token']}"})
        assert res.status_code == 200

    db.refresh(tourney)
    assert tourney.status == "IN_PROGRESS"

    # 3. Find player1's QF match
    qf1 = [m for m in tourney.matches if m.round == 1 and (m.player1_id == players[1]["user"].id or m.player2_id == players[1]["user"].id)][0]
    assert qf1.status == "READY"
    assert qf1.checkin_deadline is not None
    assert qf1.is_forfeit is False

    opponent_id = qf1.player2_id if qf1.player1_id == players[1]["user"].id else qf1.player1_id

    # 4. Player 1 leaves/forfeits the in-progress tournament
    leave_res = client.post(
        f"/api/tournaments/{tourney.id}/leave",
        headers={"Authorization": f"Bearer {players[1]['token']}"}
    )
    assert leave_res.status_code == 200
    assert leave_res.json().get("forfeited") is True

    # 5. Check match status and forfeit flags
    db.refresh(qf1)
    assert qf1.status == "COMPLETED"
    assert qf1.is_forfeit is True
    assert qf1.winner_id == opponent_id

    # 6. Check player 1 is marked eliminated
    p1_part = db.query(TournamentParticipant).filter(
        TournamentParticipant.tournament_id == tourney.id,
        TournamentParticipant.user_id == players[1]["user"].id
    ).first()
    assert p1_part.eliminated is True
    assert p1_part.status == "ELIMINATED"

    # 7. Check detail response includes checkin_deadline and is_forfeit
    detail_res = client.get(
        f"/api/tournaments/{tourney.id}",
        headers={"Authorization": f"Bearer {players[2]['token']}"}
    )
    assert detail_res.status_code == 200
    match_data = [m for m in detail_res.json()["matches"] if m["id"] == qf1.id][0]
    assert match_data["is_forfeit"] is True
    assert match_data["winner_id"] == opponent_id

    db.close()

