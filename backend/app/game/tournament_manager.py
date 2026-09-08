import asyncio
import datetime
import json
import logging
import random
from typing import Optional, Dict, List
from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.models.tournament import Tournament, TournamentParticipant, TournamentMatch
from app.models.user import User
from app.models.room import Room as DBRoom
from app.game.room_manager import room_manager, RoomSession

logger = logging.getLogger(__name__)
CHECKIN_TIMEOUT_SECONDS = 60

# Prize allocations (Virtual game currency only)
TOURNAMENT_REWARDS = {
    1: {"coins": 250, "xp": 500, "title": "Champion"},
    2: {"coins": 150, "xp": 350, "title": "Runner-Up"},
    3: {"coins": 100, "xp": 200, "title": "Semi-Finalist"},
    5: {"coins": 50, "xp": 100, "title": "Quarter-Finalist"}
}

class TournamentManager:
    def __init__(self):
        # tournament_id -> dict(user_id -> WebSocket)
        self.connections: Dict[int, Dict[int, WebSocket]] = {}
        # match_id -> asyncio.Task
        self.checkin_tasks: Dict[int, asyncio.Task] = {}

    def register_connection(self, tournament_id: int, user_id: int, ws: WebSocket):
        if tournament_id not in self.connections:
            self.connections[tournament_id] = {}
        self.connections[tournament_id][user_id] = ws

    def unregister_connection(self, tournament_id: int, user_id: int):
        if tournament_id in self.connections and user_id in self.connections[tournament_id]:
            del self.connections[tournament_id][user_id]
            if not self.connections[tournament_id]:
                del self.connections[tournament_id]

    async def broadcast_to_tournament(self, tournament_id: int, event_type: str, data: dict):
        """Broadcasts real-time events to all active websockets in the tournament lobby/bracket."""
        if tournament_id not in self.connections:
            return
        payload = json.dumps({"type": event_type, "data": data})
        for uid, ws in list(self.connections[tournament_id].items()):
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to user {uid} in tournament {tournament_id}: {e}")

    def _schedule_match_checkin(self, match_id: int, tournament_id: int, timeout_sec: int = CHECKIN_TIMEOUT_SECONDS):
        """Starts a background countdown timer to auto-forfeit absent players if they fail to check in."""
        if match_id in self.checkin_tasks and not self.checkin_tasks[match_id].done():
            self.checkin_tasks[match_id].cancel()

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self.checkin_tasks[match_id] = loop.create_task(self._match_checkin_worker(match_id, tournament_id, timeout_sec))
        except Exception as e:
            logger.error(f"Error scheduling match checkin for {match_id}: {e}")

    async def _match_checkin_worker(self, match_id: int, tournament_id: int, timeout_sec: int):
        try:
            await asyncio.sleep(timeout_sec)
            from app.database import SessionLocal
            with SessionLocal() as db:
                match = db.query(TournamentMatch).filter(TournamentMatch.id == match_id).first()
                if not match or match.status != "READY":
                    return  # Match is already LIVE or COMPLETED

                # Determine who joined the match room
                session = room_manager.get_room(match.room_code) if match.room_code else None
                p1_connected = bool(session and match.player1_id in session.connections)
                p2_connected = bool(session and match.player2_id in session.connections)

                if p1_connected and not p2_connected:
                    winner_id, loser_id = match.player1_id, match.player2_id
                    p2_name = match.player2.username if match.player2 else "Opponent"
                    forfeit_reason = f"{p2_name} did not check in within 60s (Auto-Forfeit)."
                elif p2_connected and not p1_connected:
                    winner_id, loser_id = match.player2_id, match.player1_id
                    p1_name = match.player1.username if match.player1 else "Opponent"
                    forfeit_reason = f"{p1_name} did not check in within 60s (Auto-Forfeit)."
                else:
                    winner_id, loser_id = match.player1_id, match.player2_id
                    forfeit_reason = "Match check-in expired."

                logger.info(f"Tournament match {match.match_number} timed out. Forfeit winner: {winner_id}, loser: {loser_id}")
                match.is_forfeit = True
                db.commit()

                await self.on_game_finished(match.room_code, winner_id, loser_id, db, is_forfeit=True)

                await self.broadcast_to_tournament(tournament_id, "tournament_match_forfeit", {
                    "match_id": match.id,
                    "match_number": match.match_number,
                    "winner_id": winner_id,
                    "loser_id": loser_id,
                    "reason": forfeit_reason
                })
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in match checkin worker {match_id}: {e}")
        finally:
            if match_id in self.checkin_tasks:
                del self.checkin_tasks[match_id]

    def get_or_create_active_tournament(self, db: Session) -> Tournament:
        """Finds or creates a WAITING public tournament."""
        tourney = db.query(Tournament).filter(Tournament.status == "WAITING").order_by(Tournament.id.desc()).first()
        if not tourney:
            tourney = Tournament(
                name="Letter Duel Grand Cup (8 Players)",
                status="WAITING",
                max_players=8,
                current_players=0,
                created_at=datetime.datetime.now(datetime.timezone.utc)
            )
            db.add(tourney)
            db.commit()
            db.refresh(tourney)
        return tourney

    def get_user_active_tournament(self, user_id: int, db: Session) -> Optional[Tournament]:
        """Checks if a user is currently registered in an ongoing or waiting tournament."""
        participant = (
            db.query(TournamentParticipant)
            .join(Tournament, Tournament.id == TournamentParticipant.tournament_id)
            .filter(
                TournamentParticipant.user_id == user_id,
                TournamentParticipant.eliminated == False,
                Tournament.status.in_(["WAITING", "IN_PROGRESS"])
            )
            .first()
        )
        return participant.tournament if participant else None

    async def join_tournament(self, tournament_id: int, user: User, db: Session) -> Dict:
        """Adds a player to a WAITING tournament, auto-starting bracket if full."""
        tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
        if not tourney:
            raise ValueError("Tournament not found")
        if tourney.status != "WAITING":
            raise ValueError(f"Tournament is already {tourney.status.lower().replace('_', ' ')}")

        # Check existing participation across active tournaments
        existing_tourney = self.get_user_active_tournament(user.id, db)
        if existing_tourney:
            if existing_tourney.id == tournament_id:
                raise ValueError("You have already joined this tournament")
            raise ValueError("You are already participating in another active tournament")

        if tourney.current_players >= tourney.max_players:
            raise ValueError("Tournament is full")

        # Add participant
        participant = TournamentParticipant(
            tournament_id=tourney.id,
            user_id=user.id,
            status="WAITING",
            eliminated=False,
            joined_at=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(participant)
        tourney.current_players += 1
        db.commit()
        db.refresh(tourney)

        # Broadcast participant join
        user_info = {
            "user_id": user.id,
            "username": user.username,
            "avatar": user.avatar or "avatar-1",
            "level": user.level or 1
        }
        await self.broadcast_to_tournament(tourney.id, "tournament_player_joined", {
            "tournament_id": tourney.id,
            "current_players": tourney.current_players,
            "max_players": tourney.max_players,
            "player": user_info
        })

        # Check if 8 players reached -> start tournament!
        if tourney.current_players == tourney.max_players:
            await self._start_tournament(tourney, db)

        return self.get_tournament_details(tourney.id, db)

    async def leave_tournament(self, tournament_id: int, user_id: int, db: Session) -> Dict:
        """Removes a player from a WAITING tournament."""
        tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
        if not tourney:
            raise ValueError("Tournament not found")
        if tourney.status != "WAITING":
            if tourney.status == "IN_PROGRESS":
                active_match = (
                    db.query(TournamentMatch)
                    .filter(
                        TournamentMatch.tournament_id == tournament_id,
                        (TournamentMatch.player1_id == user_id) | (TournamentMatch.player2_id == user_id),
                        TournamentMatch.status.in_(["WAITING", "READY", "LIVE"])
                    )
                    .first()
                )
                if active_match:
                    opponent_id = active_match.player2_id if active_match.player1_id == user_id else active_match.player1_id
                    user_obj = db.query(User).filter(User.id == user_id).first()
                    uname = user_obj.username if user_obj else "Player"
                    if opponent_id and active_match.room_code:
                        active_match.is_forfeit = True
                        db.commit()
                        await self.on_game_finished(active_match.room_code, opponent_id, user_id, db, is_forfeit=True)
                        await self.broadcast_to_tournament(tournament_id, "tournament_match_forfeit", {
                            "match_id": active_match.id,
                            "match_number": active_match.match_number,
                            "winner_id": opponent_id,
                            "loser_id": user_id,
                            "reason": f"{uname} surrendered the tournament (Auto-Forfeit)."
                        })
                        return {"success": True, "forfeited": True}
                    else:
                        # Waiting for opponent to arrive; mark eliminated
                        part = db.query(TournamentParticipant).filter(
                            TournamentParticipant.tournament_id == tournament_id,
                            TournamentParticipant.user_id == user_id
                        ).first()
                        if part and not part.eliminated:
                            part.eliminated = True
                            part.status = "ELIMINATED"
                            placement = 5 if active_match.round == 1 else (3 if active_match.round == 2 else 2)
                            part.placement = placement
                            rewards = TOURNAMENT_REWARDS[placement]
                            part.coins_awarded = rewards["coins"]
                            part.xp_awarded = rewards["xp"]
                            if user_obj:
                                user_obj.coins = (user_obj.coins or 500) + rewards["coins"]
                                user_obj.xp = (user_obj.xp or 0) + rewards["xp"]
                            if active_match.player1_id == user_id:
                                active_match.player1_id = None
                            elif active_match.player2_id == user_id:
                                active_match.player2_id = None
                            db.commit()
                            details = self.get_tournament_details(tournament_id, db)
                            await self.broadcast_to_tournament(tournament_id, "tournament_bracket_updated", {
                                "tournament_id": tournament_id,
                                "tournament": details
                            })
                            return {"success": True, "forfeited": True}
            raise ValueError("Cannot leave a tournament that is not in registration or in progress")

        participant = (
            db.query(TournamentParticipant)
            .filter(
                TournamentParticipant.tournament_id == tournament_id,
                TournamentParticipant.user_id == user_id
            )
            .first()
        )
        if not participant:
            raise ValueError("You are not registered in this tournament")

        db.delete(participant)
        tourney.current_players = max(0, tourney.current_players - 1)
        db.commit()
        db.refresh(tourney)

        await self.broadcast_to_tournament(tourney.id, "tournament_player_left", {
            "tournament_id": tourney.id,
            "current_players": tourney.current_players,
            "max_players": tourney.max_players,
            "user_id": user_id
        })

        return {"success": True, "current_players": tourney.current_players}

    async def _start_tournament(self, tourney: Tournament, db: Session):
        """Generates 8-player knockout bracket with deterministic seeding and provisions QF rooms."""
        now = datetime.datetime.now(datetime.timezone.utc)
        tourney.status = "IN_PROGRESS"
        tourney.started_at = now

        participants = (
            db.query(TournamentParticipant)
            .filter(TournamentParticipant.tournament_id == tourney.id)
            .all()
        )

        # Fair randomized seeding 1..8
        random.shuffle(participants)
        for idx, p in enumerate(participants, start=1):
            p.seed = idx
            p.status = "ACTIVE"
        db.commit()

        # Seed dictionary
        seeds = {p.seed: p.user_id for p in participants}

        # 1. Create Round 3 (Final) first so Semis can reference it
        final_match = TournamentMatch(
            tournament_id=tourney.id,
            round=3,
            match_number=7,
            player1_id=None,
            player2_id=None,
            status="LOCKED",
            started_at=None
        )
        db.add(final_match)
        db.flush()

        # 2. Create Round 2 (Semifinals) referencing Final
        sf1 = TournamentMatch(
            tournament_id=tourney.id,
            round=2,
            match_number=5,
            player1_id=None,
            player2_id=None,
            status="LOCKED",
            next_match_id=final_match.id,
            next_match_slot=1
        )
        sf2 = TournamentMatch(
            tournament_id=tourney.id,
            round=2,
            match_number=6,
            player1_id=None,
            player2_id=None,
            status="LOCKED",
            next_match_id=final_match.id,
            next_match_slot=2
        )
        db.add_all([sf1, sf2])
        db.flush()

        # 3. Create Round 1 (Quarterfinals) referencing Semifinals
        # Standard fair bracket pairing: (1v8, 4v5 -> SF1) and (2v7, 3v6 -> SF2)
        qf_pairings = [
            (1, seeds[1], seeds[8], sf1.id, 1),
            (2, seeds[4], seeds[5], sf1.id, 2),
            (3, seeds[2], seeds[7], sf2.id, 1),
            (4, seeds[3], seeds[6], sf2.id, 2)
        ]

        qf_matches = []
        for m_num, p1_id, p2_id, next_m_id, next_slot in qf_pairings:
            # Provision a 1v1 duel room in room_manager
            code = room_manager.create_room(allow_custom_words=True, is_private=True, entry_fee=0)
            db_room = DBRoom(
                room_code=code,
                player1_id=p1_id,
                player2_id=p2_id,
                status="READY",
                is_private=True,
                entry_fee=0
            )
            db.add(db_room)

            deadline = now + datetime.timedelta(seconds=CHECKIN_TIMEOUT_SECONDS)
            match = TournamentMatch(
                tournament_id=tourney.id,
                round=1,
                match_number=m_num,
                player1_id=p1_id,
                player2_id=p2_id,
                room_code=code,
                status="READY",
                checkin_deadline=deadline,
                is_forfeit=False,
                next_match_id=next_m_id,
                next_match_slot=next_slot,
                started_at=now
            )
            qf_matches.append(match)

        db.add_all(qf_matches)
        db.commit()

        # Start authoritative check-in countdown timer for each QF match
        for qf in qf_matches:
            self._schedule_match_checkin(qf.id, tourney.id)

        details = self.get_tournament_details(tourney.id, db)
        await self.broadcast_to_tournament(tourney.id, "tournament_started", {
            "tournament_id": tourney.id,
            "tournament": details
        })

    async def on_match_live(self, room_code: str, db: Session):
        """Called when players connect and start playing their match."""
        match = db.query(TournamentMatch).filter(TournamentMatch.room_code == room_code).first()
        if match and match.status in ("READY", "WAITING"):
            match.status = "LIVE"
            if not match.started_at:
                match.started_at = datetime.datetime.now(datetime.timezone.utc)
            if match.id in self.checkin_tasks:
                self.checkin_tasks[match.id].cancel()
                del self.checkin_tasks[match.id]
            db.commit()
            await self.broadcast_to_tournament(match.tournament_id, "tournament_match_live", {
                "match_id": match.id,
                "match_number": match.match_number,
                "status": "LIVE"
            })

    async def on_game_finished(self, room_code: str, winner_id: int, loser_id: int, db: Session, is_forfeit: bool = False):
        """Authoritative settlement of tournament duel and advancement to next round."""
        match = db.query(TournamentMatch).filter(TournamentMatch.room_code == room_code).first()
        if not match:
            return

        if match.id in self.checkin_tasks:
            self.checkin_tasks[match.id].cancel()
            del self.checkin_tasks[match.id]

        now = datetime.datetime.now(datetime.timezone.utc)
        tourney_id = match.tournament_id
        tourney = db.query(Tournament).filter(Tournament.id == tourney_id).first()

        match.winner_id = winner_id
        match.status = "COMPLETED"
        match.is_forfeit = is_forfeit
        match.finished_at = now

        # Determine loser placement and reward
        loser_participant = (
            db.query(TournamentParticipant)
            .filter(TournamentParticipant.tournament_id == tourney_id, TournamentParticipant.user_id == loser_id)
            .first()
        )
        if loser_participant:
            loser_participant.eliminated = True
            loser_participant.status = "ELIMINATED"
            placement = 5 if match.round == 1 else (3 if match.round == 2 else 2)
            loser_participant.placement = placement

            rewards = TOURNAMENT_REWARDS[placement]
            loser_participant.coins_awarded = rewards["coins"]
            loser_participant.xp_awarded = rewards["xp"]

            loser_user = db.query(User).filter(User.id == loser_id).first()
            if loser_user:
                loser_user.coins = (loser_user.coins or 500) + rewards["coins"]
                loser_user.xp = (loser_user.xp or 0) + rewards["xp"]

        # Advance winner
        winner_participant = (
            db.query(TournamentParticipant)
            .filter(TournamentParticipant.tournament_id == tourney_id, TournamentParticipant.user_id == winner_id)
            .first()
        )

        if match.round == 3:
            # Final completed -> Champion crowned!
            if winner_participant:
                winner_participant.status = "CHAMPION"
                winner_participant.placement = 1
                champ_rewards = TOURNAMENT_REWARDS[1]
                winner_participant.coins_awarded = champ_rewards["coins"]
                winner_participant.xp_awarded = champ_rewards["xp"]

                winner_user = db.query(User).filter(User.id == winner_id).first()
                if winner_user:
                    winner_user.coins = (winner_user.coins or 500) + champ_rewards["coins"]
                    winner_user.xp = (winner_user.xp or 0) + champ_rewards["xp"]

            tourney.status = "FINISHED"
            tourney.winner_id = winner_id
            tourney.finished_at = now
            db.commit()

            details = self.get_tournament_details(tourney_id, db)
            winner_name = winner_user.username if winner_user else "Champion"
            await self.broadcast_to_tournament(tourney_id, "tournament_finished", {
                "tournament_id": tourney_id,
                "winner_id": winner_id,
                "winner_username": winner_name,
                "tournament": details
            })
            return

        # Advance to next match (Round 1 -> Round 2, or Round 2 -> Round 3)
        if match.next_match_id:
            next_match = db.query(TournamentMatch).filter(TournamentMatch.id == match.next_match_id).first()
            if next_match:
                if match.next_match_slot == 1:
                    next_match.player1_id = winner_id
                else:
                    next_match.player2_id = winner_id

                # If both players are now ready in next round match, provision room
                if next_match.player1_id and next_match.player2_id:
                    next_match.status = "READY"
                    next_deadline = now + datetime.timedelta(seconds=CHECKIN_TIMEOUT_SECONDS)
                    next_match.checkin_deadline = next_deadline
                    next_match.is_forfeit = False
                    code = room_manager.create_room(allow_custom_words=True, is_private=True, entry_fee=0)
                    db_room = DBRoom(
                        room_code=code,
                        player1_id=next_match.player1_id,
                        player2_id=next_match.player2_id,
                        status="READY",
                        is_private=True,
                        entry_fee=0
                    )
                    db.add(db_room)
                    next_match.room_code = code
                    next_match.started_at = now
                    db.commit()
                    self._schedule_match_checkin(next_match.id, tourney_id)
                else:
                    next_match.status = "WAITING"

        db.commit()

        # Broadcast bracket update
        details = self.get_tournament_details(tourney_id, db)
        await self.broadcast_to_tournament(tourney_id, "tournament_bracket_updated", {
            "tournament_id": tourney_id,
            "tournament": details
        })

    def get_tournament_details(self, tournament_id: int, db: Session) -> Dict:
        """Returns full serialized tournament state for REST and WebSocket payloads."""
        tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
        if not tourney:
            return {}

        participants_list = []
        for p in tourney.participants:
            participants_list.append({
                "id": p.id,
                "tournament_id": p.tournament_id,
                "user_id": p.user_id,
                "username": p.user.username if p.user else "Player",
                "avatar": p.user.avatar or "avatar-1" if p.user else "avatar-1",
                "level": p.user.level or 1 if p.user else 1,
                "seed": p.seed,
                "status": p.status,
                "eliminated": p.eliminated,
                "placement": p.placement,
                "coins_awarded": p.coins_awarded,
                "xp_awarded": p.xp_awarded,
                "joined_at": p.joined_at.isoformat() if p.joined_at else None
            })

        matches_list = []
        for m in sorted(tourney.matches, key=lambda x: x.match_number):
            matches_list.append({
                "id": m.id,
                "tournament_id": m.tournament_id,
                "round": m.round,
                "match_number": m.match_number,
                "player1_id": m.player1_id,
                "player1_username": m.player1.username if m.player1 else None,
                "player1_avatar": m.player1.avatar if m.player1 else "avatar-1",
                "player1_level": m.player1.level or 1 if m.player1 else 1,
                "player2_id": m.player2_id,
                "player2_username": m.player2.username if m.player2 else None,
                "player2_avatar": m.player2.avatar if m.player2 else "avatar-2",
                "player2_level": m.player2.level or 1 if m.player2 else 1,
                "winner_id": m.winner_id,
                "winner_username": m.winner.username if m.winner else None,
                "room_code": m.room_code,
                "status": m.status,
                "next_match_id": m.next_match_id,
                "next_match_slot": m.next_match_slot,
                "checkin_deadline": m.checkin_deadline.isoformat() if m.checkin_deadline else None,
                "is_forfeit": bool(m.is_forfeit),
                "started_at": m.started_at.isoformat() if m.started_at else None,
                "finished_at": m.finished_at.isoformat() if m.finished_at else None
            })

        return {
            "id": tourney.id,
            "name": tourney.name,
            "status": tourney.status,
            "max_players": tourney.max_players,
            "current_players": tourney.current_players,
            "winner_id": tourney.winner_id,
            "winner_username": tourney.winner.username if tourney.winner else None,
            "created_at": tourney.created_at.isoformat() if tourney.created_at else None,
            "started_at": tourney.started_at.isoformat() if tourney.started_at else None,
            "finished_at": tourney.finished_at.isoformat() if tourney.finished_at else None,
            "participants": participants_list,
            "matches": matches_list
        }

tournament_manager = TournamentManager()
