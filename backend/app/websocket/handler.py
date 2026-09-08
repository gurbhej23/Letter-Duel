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
    """Broadcast JSON message to all active WebSocket connections in room session (skipping sender_ws if specified)."""
    payload = json.dumps({"type": event_type, "data": data})
    for pid, ws in list(session.connections.items()):
        if sender_ws and ws == sender_ws:
            continue
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
            view["entry_fee"] = getattr(session, "entry_fee", 50)
            view["pot"] = getattr(session, "entry_fee", 50) * 2
            await ws.send_text(json.dumps({"type": "game_state", "data": view}))
        except Exception as e:
            logger.warning(f"Failed to sync state to player {pid}: {e}")

def cancel_turn_timer(session: RoomSession):
    """Cancels any running turn timer."""
    if session.turn_timer_task and not session.turn_timer_task.done():
        session.turn_timer_task.cancel()
        session.turn_timer_task = None

async def bot_turn_worker(session: RoomSession):
    """Simulates an online challenger taking their turn after a natural thinking delay."""
    try:
        await asyncio.sleep(3.5)  # 3.5s thinking delay
        if not session.game or session.game.state != "PLAYING":
            return
        if session.game.current_turn_player_id != 99999:
            return

        guessed = set(session.game.guessed_letters.get(99999, []))
        common_order = "EARTOISNLCDUGPMHBYFVKWXZJQ"
        chosen_letter = "A"
        for ch in common_order:
            if ch not in guessed:
                chosen_letter = ch
                break

        ok, result_data, notice = session.game.guess_letter(99999, chosen_letter)
        if ok:
            bot_name = session.game.player2_username or "Challenger"
            await broadcast_to_room(session, "guess_result", {
                "guesser_id": 99999,
                "guesser_username": bot_name,
                "letter": result_data["letter"],
                "result": result_data["result"],
                "next_turn_player_id": result_data["next_turn_player_id"],
                "game_over": result_data["game_over"],
                "positions": result_data.get("positions", [])
            })
            sys_msg = f"{bot_name} guessed '{chosen_letter}' → {'YES' if result_data['result'] else 'NO'}."
            await broadcast_to_room(session, "chat_message", {
                "sender_id": None,
                "sender_username": "SYSTEM",
                "message": sys_msg,
                "is_system": True,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            })

            if result_data["game_over"]:
                cancel_turn_timer(session)
                with SessionLocal() as db_session:
                    persist_game_end_to_db(session, db_session)
                await broadcast_to_room(session, "game_won", {
                    "winner_id": result_data["winner_id"],
                    "reason": result_data["win_reason"],
                    "game_over": True,
                    "rewards": getattr(session.game, "rewards", None)
                })
            else:
                start_turn_timer(session)

            await send_sync_states(session)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error in bot_turn_worker: {e}")

def start_turn_timer(session: RoomSession):
    """
    Starts an authoritative 30-second timer for the current player's turn.
    If the player does not guess within 30s, the turn automatically switches to the other player.
    If the active player is an online simulated challenger (bot), runs bot_turn_worker.
    """
    cancel_turn_timer(session)

    if not session.game or session.game.state != "PLAYING":
        return

    loop = asyncio.get_event_loop()

    # If it's the bot's turn, execute bot turn worker
    if session.game.is_bot_opponent and session.game.current_turn_player_id == 99999:
        session.turn_timer_task = loop.create_task(bot_turn_worker(session))
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
                            "game_over": True,
                            "rewards": getattr(session.game, "rewards", None)
                        })
                    else:
                        start_turn_timer(session)

                    await send_sync_states(session)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in turn_timer_worker: {e}")

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

    # Update player stats & awards
    entry_fee = getattr(session, "entry_fee", None)
    if not entry_fee and db_room:
        entry_fee = getattr(db_room, "entry_fee", 50)
    if not entry_fee:
        entry_fee = 50

    pot_reward = entry_fee * 2
    winner_level_up = False
    winner_coins = 500
    winner_level = 1

    winner = db.query(User).filter(User.id == winner_id).first()
    if winner:
        winner.wins += 1
        winner.xp += 100
        # Winner wins the opponent's entry stake: +entry_fee net coins!
        winner.coins = (winner.coins or 500) + entry_fee
        winner.current_streak += 1
        if winner.current_streak > winner.best_streak:
            winner.best_streak = winner.current_streak

        old_level = winner.level or 1
        new_level = max(1, (winner.xp // 200) + 1)
        if new_level > old_level:
            winner_level_up = True
            winner.level = new_level
            winner.coins += 100  # Level up reward!
        winner_coins = winner.coins
        winner_level = winner.level

    loser_level_up = False
    loser_coins = 500
    loser_level = 1

    loser = db.query(User).filter(User.id == loser_id).first()
    if loser:
        loser.losses += 1
        loser.xp += 25
        # Loser loses their entry fee coins
        loser.coins = max(0, (loser.coins or 500) - entry_fee)
        loser.current_streak = 0
        old_loser_level = loser.level or 1
        new_loser_level = max(1, (loser.xp // 200) + 1)
        if new_loser_level > old_loser_level:
            loser_level_up = True
            loser.level = new_loser_level
            loser.coins += 100
        loser_coins = loser.coins
        loser_level = loser.level

    # Store reward breakdown in game session for broadcasting
    session.game.rewards = {
        "entry_fee": entry_fee,
        "pot": pot_reward,
        "winner_id": winner_id,
        "winner_coins_won": entry_fee,
        "loser_coins_lost": entry_fee,
        "winner_xp_earned": 100,
        "loser_xp_earned": 25,
        "winner_coins": winner_coins,
        "winner_level": winner_level,
        "winner_level_up": winner_level_up,
        "loser_coins": loser_coins,
        "loser_level": loser_level,
        "loser_level_up": loser_level_up
    }

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

    # Tournament advancement hook
    try:
        from app.game.tournament_manager import tournament_manager
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(tournament_manager.on_game_finished(session.room_code, winner_id, loser_id, db))
    except Exception as e:
        logger.error(f"Error in tournament advancement hook: {e}")

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
                    "reason": "Opponent disconnected and left the match.",
                    "game_over": True,
                    "rewards": getattr(session.game, "rewards", None)
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
            # If the room has an open player2 slot and is waiting/ready, assign this user as player2
            if db_room.player2_id is None and db_room.status in ("WAITING", "READY"):
                db_room.player2_id = player_id
                db_room.status = "READY"
                db.commit()
                db.refresh(db_room)
                logger.info(f"Assigned user {user.username} (id: {player_id}) as player2 for room {room_code}")
            else:
                await websocket.send_text(json.dumps({"type": "error", "data": {"message": "Unauthorized: You are not a player in this room."}}))
                await websocket.close()
                return

        if not session:
            room_fee = getattr(db_room, "entry_fee", 50) or 50
            session = RoomSession(
                room_code=room_code,
                allow_custom_words=True,
                is_private=getattr(db_room, "is_private", True),
                entry_fee=room_fee
            )
            room_manager.rooms[room_code] = session
        elif db_room and hasattr(db_room, "entry_fee") and db_room.entry_fee:
            session.entry_fee = db_room.entry_fee

        # Check if returning / reconnecting
        is_reconnect = False
        if player_id in session.disconnect_tasks:
            task = session.disconnect_tasks.pop(player_id)
            if not task.done():
                task.cancel()
            is_reconnect = True
            logger.info(f"Player {user.username} reconnected before forfeit timer.")

        session.connections[player_id] = websocket

        from app.game.presence import presence_manager
        await presence_manager.add_connection(player_id, websocket)
        try:
            await websocket.send_text(json.dumps({
                "type": "presence_update",
                "data": {"online_count": presence_manager.get_online_count()}
            }))
        except Exception:
            pass

        # Initialize or populate Game Engine
        if not session.game and db_room:
            p2 = db.query(User).filter(User.id == db_room.player2_id).first() if db_room.player2_id else None
            p1 = db.query(User).filter(User.id == db_room.player1_id).first()
            if p1:
                session.game = LetterDuelGame(
                    room_code=room_code,
                    player1_id=p1.id,
                    player2_id=p2.id if p2 else None,
                    player1_username=p1.username,
                    player2_username=p2.username if p2 else None,
                    player1_avatar=p1.avatar or "avatar-1",
                    player2_avatar=(p2.avatar if p2 else None) or "avatar-2",
                    allow_custom_words=session.allow_custom_words
                )
        elif session.game and db_room and db_room.player2_id and not session.game.player2_id:
            p2 = db.query(User).filter(User.id == db_room.player2_id).first()
            if p2:
                session.game.add_player2(p2.id, p2.username, p2.avatar or "avatar-2")

        # In global matchmaking (public rooms), automatically mark both players ready so match immediately begins
        if session.game and session.game.player1_id and session.game.player2_id and (not session.is_private or not db_room.is_private):
            if session.game.state == "READY":
                session.game.ready_players.add(session.game.player1_id)
                session.game.ready_players.add(session.game.player2_id)
                session.game.state = "WORD_SELECTION"

        # Send recent chat history to reconnecting/connecting client
        if db_room:
            past_chats = (
                db.query(DBChatMessage)
                .filter(DBChatMessage.room_id == db_room.id)
                .order_by(DBChatMessage.created_at.asc())
                .limit(50)
                .all()
            )
            chat_list = []
            for c in past_chats:
                sender_name = c.sender.username if c.sender else "SYSTEM"
                sender_av = c.sender.avatar if c.sender else None
                chat_list.append({
                    "id": c.id,
                    "sender_id": c.sender_id,
                    "sender_username": sender_name,
                    "sender_avatar": sender_av,
                    "message": c.message,
                    "is_system": c.is_system,
                    "timestamp": c.created_at.isoformat() if c.created_at else None
                })
            await websocket.send_text(json.dumps({"type": "chat_history", "data": chat_list}))

        # Notify room of join/reconnect (exclude sender from receiving their own notification)
        if is_reconnect:
            await broadcast_to_room(session, "reconnected", {
                "player_id": player_id,
                "username": user.username,
                "message": f"{user.username} has reconnected to the duel."
            }, sender_ws=websocket)
        else:
            await broadcast_to_room(session, "player_joined", {
                "player_id": player_id,
                "username": user.username,
                "avatar": user.avatar,
                "message": f"{user.username} entered the room."
            }, sender_ws=websocket)

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
                    if session.game.is_bot_opponent:
                        session.game.ready_players.add(99999)
                    ok, notice = session.game.set_player_ready(player_id)
                    if ok:
                        await broadcast_to_room(session, "player_ready", {
                            "player_id": player_id,
                            "username": user.username,
                            "game_state": session.game.state
                        })
                        if session.game.state == "WORD_SELECTION":
                            await broadcast_to_room(session, "game_starting", {
                                "message": "Both players ready! Choose your secret word (3-20 letters)."
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
                            try:
                                from app.game.tournament_manager import tournament_manager
                                loop = asyncio.get_event_loop()
                                if loop.is_running():
                                    loop.create_task(tournament_manager.on_match_live(session.room_code, db))
                            except Exception as e:
                                logger.error(f"Error in tournament match live hook: {e}")
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
                                "game_over": True,
                                "rewards": getattr(session.game, "rewards", None)
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
                                "game_over": True,
                                "rewards": getattr(session.game, "rewards", None)
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

            # 6. REAL-TIME CHAT (IMMEDIATE BROADCAST -> ASYNC DB COMMIT)
            elif msg_type == "chat_message":
                content = (data.get("message") or "").strip()
                if content:
                    import uuid
                    msg_id = str(data.get("message_id") or uuid.uuid4())
                    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    
                    # 1. Immediately broadcast to room over WebSocket (Zero DB latency)
                    await broadcast_to_room(session, "chat_message", {
                        "id": msg_id,
                        "message_id": msg_id,
                        "sender_id": player_id,
                        "sender_username": user.username,
                        "sender_avatar": user.avatar,
                        "message": content[:500],
                        "is_system": False,
                        "timestamp": timestamp
                    })

                    # 2. Persist to database in background thread without blocking event loop
                    async def _async_save_chat(r_code: str, p_id: int, text: str):
                        try:
                            def _db_save():
                                with SessionLocal() as db_worker:
                                    r = db_worker.query(DBRoom).filter(DBRoom.room_code == r_code).first()
                                    if r:
                                        chat_row = DBChatMessage(
                                            room_id=r.id,
                                            sender_id=p_id,
                                            message=text,
                                            is_system=False,
                                            created_at=datetime.datetime.now(datetime.timezone.utc)
                                        )
                                        db_worker.add(chat_row)
                                        db_worker.commit()
                            await asyncio.to_thread(_db_save)
                        except Exception as chat_db_err:
                            logger.error(f"[Chat] Background DB persist error: {chat_db_err}")

                    asyncio.create_task(_async_save_chat(room_code, player_id, content[:500]))

            # 7. TYPING INDICATOR (INSTANT RELAY, ZERO DB)
            elif msg_type == "typing":
                is_typing = bool(data.get("is_typing", False))
                if is_typing:
                    session.typing_players.add(player_id)
                else:
                    session.typing_players.discard(player_id)
                await broadcast_to_room(session, "typing", {
                    "player_id": player_id,
                    "username": user.username,
                    "is_typing": is_typing
                }, sender_ws=websocket)

            # HEARTBEAT PING / PONG
            elif msg_type == "ping":
                from app.game.presence import presence_manager
                presence_manager.touch_user(player_id)
                try:
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "data": {"online_count": presence_manager.get_online_count()}
                    }))
                except Exception:
                    pass

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
                            "reason": f"{user.username} left the duel.",
                            "game_over": True,
                            "rewards": getattr(session.game, "rewards", None)
                        })
                        await broadcast_to_room(session, "chat_message", {
                            "sender_id": None,
                            "sender_username": "SYSTEM",
                            "message": f"🚪 {user.username} left the match.",
                            "is_system": True,
                            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                        })
                        await send_sync_states(session)
                else:
                    # In LOBBY
                    if session.game:
                        session.game.ready_players.discard(player_id)
                    
                    db_room = db.query(DBRoom).filter(DBRoom.room_code == room_code).first()
                    if db_room:
                        if db_room.player1_id == player_id:
                            if not db_room.player2_id or db_room.player2_id == 99999:
                                db.delete(db_room)
                            else:
                                db_room.status = "ABANDONED"
                        elif db_room.player2_id == player_id:
                            db_room.player2_id = None
                            db_room.status = "WAITING"
                        db.commit()

                    await broadcast_to_room(session, "player_left", {
                        "player_id": player_id,
                        "username": user.username,
                        "message": f"{user.username} left the room."
                    }, sender_ws=websocket)
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
            if not was_explicit and session.game and session.game.state in ("PLAYING", "WORD_SELECTION"):
                await broadcast_to_room(session, "opponent_disconnected", {
                    "player_id": user.id,
                    "username": user.username,
                    "grace_seconds": settings.DISCONNECT_TIMEOUT_SECONDS,
                    "message": f"{user.username} disconnected. Waiting {settings.DISCONNECT_TIMEOUT_SECONDS}s to reconnect..."
                })
                loop = asyncio.get_event_loop()
                task = loop.create_task(handle_disconnect_grace_period(session, user.id))
                session.disconnect_tasks[user.id] = task

        if user:
            from app.game.presence import presence_manager
            await presence_manager.remove_connection(user.id, websocket)
            await room_manager.remove_from_quickmatch_queue(user.id)

        db.close()
