import asyncio
import datetime
import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.auth.deps import get_user_from_token
from app.models.user import User
from app.models.room import Room as DBRoom
from app.models.game import Game as DBGame
from app.models.guess import Guess as DBGuess
from app.models.chat import ChatMessage as DBChatMessage
from app.game.room_manager import room_manager, RoomSession
from app.game.engine import LetterDuelGame
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

async def broadcast_to_room(session: RoomSession, event_type: str, data: dict, sender_ws: Optional[WebSocket] = None):
    """Broadcast JSON message to all active WebSocket connections in room session."""
    payload = json.dumps({"type": event_type, "data": data})
    for pid, ws in list(session.connections.items()):
        try:
            await ws.send_text(payload)
        except Exception as e:
            logger.warning(f"Failed to send to player {pid}: {e}")

async def send_sync_states(session: RoomSession):
    """Send personalized sanitized view to each connected player."""
    if not session.game:
        return
    for pid, ws in list(session.connections.items()):
        try:
            view = session.game.get_player_view(pid)
            await ws.send_text(json.dumps({"type": "game_state", "data": view}))
        except Exception as e:
            logger.warning(f"Failed to sync state to player {pid}: {e}")

def cancel_turn_timer(session: RoomSession):
    """Cancels any running turn timer."""
    if session.turn_timer_task and not session.turn_timer_task.done():
        session.turn_timer_task.cancel()
        session.turn_timer_task = None

def start_turn_timer(session: RoomSession):
    """
    Starts an authoritative 60-second timer for the current player's turn.
    If the player does not guess within 60s (1 minute), the turn automatically switches to the other player.
    """
    cancel_turn_timer(session)

    if not session.game or session.game.state != "PLAYING":
        return

    async def turn_timer_worker():
        try:
            await asyncio.sleep(session.game.turn_timeout_seconds)
            if session.game and session.game.state == "PLAYING":
                ok, timeout_data, notice = session.game.timeout_turn()
                if ok:
                    await broadcast_to_room(session, "turn_timeout", timeout_data)
                    await broadcast_to_room(session, "chat_message", {
                        "sender_id": None,
                        "sender_username": "SYSTEM",
                        "message": f"{notice}",
                        "is_system": True,
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                    })

                    if timeout_data.get("game_over"):
                        cancel_turn_timer(session)
                        with SessionLocal() as db_session:
                            persist_game_end_to_db(session, db_session)
                        await broadcast_to_room(session, "game_won", {
                            "winner_id": timeout_data["winner_id"],
                            "reason": timeout_data["win_reason"],
                            "game_over": True
                        })
                    else:
                        # Still has lifelines: automatically schedule 60s timer for next player!
                        start_turn_timer(session)

                    await send_sync_states(session)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in turn_timer_worker: {e}")

    loop = asyncio.get_event_loop()
    session.turn_timer_task = loop.create_task(turn_timer_worker())

def persist_game_end_to_db(session: RoomSession, db: Session):
    """Save finalized match results, XP, win/loss stats, and guess history to SQLite/PostgreSQL."""
    if not session.game or not session.game.winner_id:
        return

    game = session.game
    winner_id = game.winner_id
    loser_id = game.player2_id if winner_id == game.player1_id else game.player1_id

    # Create/update DB Game record
    now = datetime.datetime.now(datetime.timezone.utc)
    db_game = DBGame(
        room_id=0,  # Will link if room is in DB
        player1_id=game.player1_id,
        player2_id=game.player2_id,
        player1_word_length=game.word_lengths.get(game.player1_id, 0),
        player2_word_length=game.word_lengths.get(game.player2_id, 0),
        winner_id=winner_id,
        status="FINISHED" if game.win_reason != "FORFEIT" else "FORFEIT",
        started_at=game.started_at or now,
        ended_at=game.ended_at or now
    )

    db_room = db.query(DBRoom).filter(DBRoom.room_code == session.room_code).first()
    if db_room:
        db_game.room_id = db_room.id
        db_room.status = "GAME_OVER"

    db.add(db_game)
    db.flush()

    # Update player stats
    winner = db.query(User).filter(User.id == winner_id).first()
    if winner:
        winner.wins += 1
        winner.xp += 100
        winner.current_streak += 1
        if winner.current_streak > winner.best_streak:
            winner.best_streak = winner.current_streak

    loser = db.query(User).filter(User.id == loser_id).first()
    if loser:
        loser.losses += 1
        loser.xp += 25
        loser.current_streak = 0

    # Save guesses
    for log in game.history_log:
        db_guess = DBGuess(
            game_id=db_game.id,
            player_id=log["player_id"],
            letter=log.get("letter") or log.get("word", ""),
            is_full_word=(log.get("type") == "word_guess"),
            result=log.get("result", False),
            created_at=now
        )
        db.add(db_guess)

    db.commit()

async def handle_disconnect_grace_period(session: RoomSession, disconnected_player_id: int):
    """Wait 60s for reconnection; if expired, opponent wins by forfeit."""
    try:
        await asyncio.sleep(settings.DISCONNECT_TIMEOUT_SECONDS)
        # If player is still not in connections
        if disconnected_player_id not in session.connections and session.game and session.game.state != "GAME_OVER":
            logger.info(f"Player {disconnected_player_id} did not reconnect within 60s. Forfeiting.")
            ok, forfeit_data = session.game.forfeit(disconnected_player_id, reason="FORFEIT_DISCONNECT")
            if ok:
                with SessionLocal() as db:
                    persist_game_end_to_db(session, db)
                
                await broadcast_to_room(session, "game_won", {
                    "winner_id": session.game.winner_id,
                    "reason": "Opponent disconnected and forfeited.",
                    "game_over": True
                })
                await send_sync_states(session)
    except asyncio.CancelledError:
        pass

@router.websocket("/ws/room/{room_code}")
async def websocket_room_endpoint(
    websocket: WebSocket,
    room_code: str,
    token: Optional[str] = Query(None)
):
    await websocket.accept()

    db: Session = SessionLocal()
    user: Optional[User] = None
    try:
        user = get_user_from_token(token, db) if token else None
        if not user:
            await websocket.send_text(json.dumps({"type": "error", "data": {"message": "Invalid authentication token."}}))
            await websocket.close()
            return

        room_code = room_code.upper()
        session = room_manager.get_room(room_code)
        
        # Verify room exists in DB and user is a participant
        db_room = db.query(DBRoom).filter(DBRoom.room_code == room_code).first()
        if not db_room:
            await websocket.send_text(json.dumps({"type": "error", "data": {"message": "Room not found."}}))
            await websocket.close()
            return

        player_id = user.id
        if db_room.player1_id != player_id and db_room.player2_id != player_id:
            await websocket.send_text(json.dumps({"type": "error", "data": {"message": "Unauthorized: You are not a player in this room."}}))
            await websocket.close()
            return

        if not session:
            session = RoomSession(room_code=room_code)
            room_manager.rooms[room_code] = session

        # Check if returning / reconnecting
        is_reconnect = False
        if player_id in session.disconnect_tasks:
            task = session.disconnect_tasks.pop(player_id)
            if not task.done():
                task.cancel()
            is_reconnect = True
            logger.info(f"Player {user.username} reconnected before forfeit timer.")

        session.connections[player_id] = websocket

        # Initialize or populate Game Engine
        if not session.game and db_room:
            # Check if player2 joined
            p2 = db.query(User).filter(User.id == db_room.player2_id).first() if db_room.player2_id else None
            p1 = db.query(User).filter(User.id == db_room.player1_id).first()
            if p1 and p2:
                session.game = LetterDuelGame(
                    room_code=room_code,
                    player1_id=p1.id,
                    player2_id=p2.id,
                    player1_username=p1.username,
                    player2_username=p2.username,
                    player1_avatar=p1.avatar or "avatar-1",
                    player2_avatar=p2.avatar or "avatar-2",
                    allow_custom_words=session.allow_custom_words
                )

        # Notify room of join/reconnect
        if is_reconnect:
            await broadcast_to_room(session, "reconnected", {
                "player_id": player_id,
                "username": user.username,
                "message": f"{user.username} has reconnected to the duel."
            })
        else:
            await broadcast_to_room(session, "player_joined", {
                "player_id": player_id,
                "username": user.username,
                "avatar": user.avatar,
                "message": f"{user.username} entered the room."
            })

        await send_sync_states(session)

        # Main message receive loop
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
            except Exception:
                continue

            msg_type = msg.get("type")
            data = msg.get("data", {})

            # 1. PLAYER READY
            if msg_type == "player_ready":
                if session.game:
                    ok, notice = session.game.set_player_ready(player_id)
                    if ok:
                        await broadcast_to_room(session, "player_ready", {
                            "player_id": player_id,
                            "username": user.username,
                            "game_state": session.game.state
                        })
                        if session.game.state == "WORD_SELECTION":
                            await broadcast_to_room(session, "game_starting", {
                                "message": "Both players ready! Choose your secret word (5-15 letters)."
                            })
                        await send_sync_states(session)

            # 2. WORD SELECTION / LOCK WORD
            elif msg_type == "word_locked":
                secret_word = data.get("word", "")
                if session.game:
                    ok, notice = session.game.lock_word(player_id, secret_word)
                    if ok:
                        # Inform opponent ONLY that word is locked (NEVER reveal the word)
                        duel_started = (session.game.state == "PLAYING")
                        await broadcast_to_room(session, "word_locked", {
                            "player_id": player_id,
                            "username": user.username,
                            "word_length": session.game.word_lengths.get(player_id, 0),
                            "duel_started": duel_started
                        })
                        if duel_started:
                            start_turn_timer(session)
                        await send_sync_states(session)
                    else:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "data": {"message": notice}
                        }))

            # 3. LETTER GUESS (CRITICAL: ALWAYS SWITCHES TURN)
            elif msg_type == "letter_guess":
                letter = data.get("letter", "")
                if session.game:
                    ok, result_data, notice = session.game.guess_letter(player_id, letter)
                    if ok:
                        # Broadcast guess result
                        await broadcast_to_room(session, "guess_result", {
                            "guesser_id": player_id,
                            "guesser_username": user.username,
                            "letter": result_data["letter"],
                            "result": result_data["result"],  # True (YES) or False (NO)
                            "next_turn_player_id": result_data["next_turn_player_id"],
                            "game_over": result_data["game_over"],
                            "positions": result_data.get("positions", [])
                        })
                        
                        # System chat message
                        sys_msg = f"{user.username} guessed '{result_data['letter']}' → {'YES' if result_data['result'] else 'NO'}."
                        await broadcast_to_room(session, "chat_message", {
                            "sender_id": None,
                            "sender_username": "SYSTEM",
                            "message": sys_msg,
                            "is_system": True,
                            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                        })

                        if result_data["game_over"]:
                            cancel_turn_timer(session)
                            persist_game_end_to_db(session, db)
                            await broadcast_to_room(session, "game_won", {
                                "winner_id": result_data["winner_id"],
                                "reason": result_data["win_reason"],
                                "game_over": True
                            })
                        else:
                            start_turn_timer(session)

                        await send_sync_states(session)
                    else:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "data": {"message": notice}
                        }))

            # 4. FULL WORD GUESS
            elif msg_type == "word_guess":
                guessed_word = data.get("word", "")
                if session.game:
                    ok, result_data, notice = session.game.guess_full_word(player_id, guessed_word)
                    if ok:
                        await broadcast_to_room(session, "word_guess_result", {
                            "guesser_id": player_id,
                            "guesser_username": user.username,
                            "word": result_data["word"],
                            "result": result_data["result"],
                            "attempts_left": result_data["attempts_left"],
                            "next_turn_player_id": result_data["next_turn_player_id"],
                            "game_over": result_data["game_over"]
                        })

                        sys_msg = f"{user.username} guessed full word '{result_data['word']}' → {'CORRECT! 🏆' if result_data['result'] else 'INCORRECT.'}"
                        await broadcast_to_room(session, "chat_message", {
                            "sender_id": None,
                            "sender_username": "SYSTEM",
                            "message": sys_msg,
                            "is_system": True,
                            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                        })

                        if result_data["game_over"]:
                            cancel_turn_timer(session)
                            persist_game_end_to_db(session, db)
                            await broadcast_to_room(session, "game_won", {
                                "winner_id": result_data["winner_id"],
                                "reason": result_data["win_reason"],
                                "game_over": True
                            })
                        else:
                            start_turn_timer(session)

                        await send_sync_states(session)
                    else:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "data": {"message": notice}
                        }))

            # 5. REMATCH
            elif msg_type == "rematch_request":
                if session.game:
                    ok, started, notice = session.game.request_rematch(player_id)
                    if ok:
                        if started:
                            cancel_turn_timer(session)
                        await broadcast_to_room(session, "rematch_requested", {
                            "player_id": player_id,
                            "username": user.username,
                            "rematch_started": started,
                            "message": notice
                        })
                        await send_sync_states(session)

            # 6. REAL-TIME CHAT
            elif msg_type == "chat_message":
                content = (data.get("message") or "").strip()
                if content:
                    # Persist chat
                    db_room = db.query(DBRoom).filter(DBRoom.room_code == room_code).first()
                    if db_room:
                        db_chat = DBChatMessage(
                            room_id=db_room.id,
                            sender_id=player_id,
                            message=content[:500],
                            is_system=False,
                            created_at=datetime.datetime.now(datetime.timezone.utc)
                        )
                        db.add(db_chat)
                        db.commit()

                    await broadcast_to_room(session, "chat_message", {
                        "sender_id": player_id,
                        "sender_username": user.username,
                        "sender_avatar": user.avatar,
                        "message": content[:500],
                        "is_system": False,
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                    })

            # 7. TYPING INDICATOR
            elif msg_type == "typing":
                is_typing = data.get("is_typing", False)
                if is_typing:
                    session.typing_players.add(player_id)
                else:
                    session.typing_players.discard(player_id)
                await broadcast_to_room(session, "typing", {
                    "player_id": player_id,
                    "username": user.username,
                    "is_typing": is_typing
                }, sender_ws=websocket)

            # 8. EXPLICIT LEAVE / FORFEIT / LOGOUT
            elif msg_type in ("leave_room", "forfeit"):
                session.explicit_leaves.add(player_id)
                if player_id in session.disconnect_tasks:
                    session.disconnect_tasks[player_id].cancel()
                    session.disconnect_tasks.pop(player_id, None)

                # If actively playing or in word selection, immediately forfeit match
                if session.game and session.game.state in ("PLAYING", "WORD_SELECTION"):
                    ok, forfeit_data = session.game.forfeit(player_id, reason="FORFEIT_SURRENDER")
                    if ok:
                        cancel_turn_timer(session)
                        with SessionLocal() as db_session:
                            persist_game_end_to_db(session, db_session)
                        
                        await broadcast_to_room(session, "game_won", {
                            "winner_id": session.game.winner_id,
                            "reason": f"{user.username} left/surrendered the duel.",
                            "game_over": True
                        })
                        await broadcast_to_room(session, "chat_message", {
                            "sender_id": None,
                            "sender_username": "SYSTEM",
                            "message": f"🏳️ {user.username} left/surrendered the match.",
                            "is_system": True,
                            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                        })
                        await send_sync_states(session)
                else:
                    # In LOBBY
                    if session.game:
                        session.game.ready_players.discard(player_id)
                    await broadcast_to_room(session, "player_left", {
                        "player_id": player_id,
                        "username": user.username,
                        "message": f"{user.username} left the room."
                    })
                    await send_sync_states(session)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for player {user.username if user else 'unknown'}")
    except Exception as e:
        logger.error(f"WebSocket unhandled error: {e}", exc_info=True)
    finally:
        # Handle disconnect cleanup
        if user and session:
            session.connections.pop(user.id, None)
            session.typing_players.discard(user.id)
            
            was_explicit = user.id in session.explicit_leaves
            
            # Only start the 60s disconnect grace period if it was an unexpected drop during active game
            if not was_explicit and session.game and session.game.state == "PLAYING":
                await broadcast_to_room(session, "opponent_disconnected", {
                    "player_id": user.id,
                    "username": user.username,
                    "grace_seconds": settings.DISCONNECT_TIMEOUT_SECONDS,
                    "message": f"{user.username} disconnected. Waiting {settings.DISCONNECT_TIMEOUT_SECONDS}s to reconnect..."
                })
                loop = asyncio.get_event_loop()
                task = loop.create_task(handle_disconnect_grace_period(session, user.id))
                session.disconnect_tasks[user.id] = task

        db.close()
