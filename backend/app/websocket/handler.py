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


from collections import Counter
from app.game.words import STANDARD_DICTIONARY
import random


def get_bot_candidates(game) -> list:
    """Find words from STANDARD_DICTIONARY matching the opponent's word length and current revealed mask."""
    opponent_id = game.player1_id
    target_len = game.word_lengths.get(opponent_id, 0)
    if target_len <= 0:
        return []

    mask = game.discovered_masks.get(99999, [])
    guessed = {c.upper() for c in game.guessed_letters.get(99999, [])}
    revealed_in_mask = {c.upper() for c in mask if c != "_"}
    wrong_letters = {c for c in guessed if c not in revealed_in_mask}

    candidates = []
    for raw_word in STANDARD_DICTIONARY:
        w = raw_word.strip().upper()
        if len(w) != target_len or not w.isalpha():
            continue
        # Skip words containing letters known not to be in the target word
        if any(bad in w for bad in wrong_letters):
            continue

        match = True
        for i, char in enumerate(mask):
            if char != "_":
                if w[i] != char.upper():
                    match = False
                    break
            else:
                if w[i] in revealed_in_mask:
                    match = False
                    break
        if match:
            candidates.append(w)

    return candidates


def pick_bot_letter_from_candidates(candidates: list, guessed: set, difficulty: str) -> str:
    """Pick an intelligent un-guessed letter using candidate frequency or standard English frequency."""
    frequency_fallback = "EARIOTNSLCUDPMHGBFYWKVXZJQ"

    if candidates:
        freq = Counter()
        for w in candidates:
            for ch in set(w):
                if ch not in guessed and ch.isalpha():
                    freq[ch] += 1

        ranked = [ch for ch, _ in freq.most_common()]
        if ranked:
            if difficulty == "hard":
                return ranked[0]
            elif difficulty == "normal":
                top = ranked[:min(len(ranked), 2)]
                return top[0] if random.random() < 0.8 else top[-1]
            else:  # easy
                top = ranked[:min(len(ranked), 4)]
                return random.choice(top)

    remaining = [c for c in frequency_fallback if c not in guessed]
    if remaining:
        if difficulty == "easy":
            top_slice = remaining[:min(len(remaining), 6)]
            return random.choice(top_slice)
        elif difficulty == "normal":
            top_slice = remaining[:min(len(remaining), 3)]
            return top_slice[0] if random.random() < 0.85 else top_slice[-1]
        else:  # hard
            return remaining[0]

    all_az = [chr(c) for c in range(ord('A'), ord('Z') + 1) if chr(c) not in guessed]
    if all_az:
        return all_az[0]
    return "E"


def pick_bot_action(game, difficulty: str = "normal") -> tuple:
    """
    Determines next bot action: ('word', word_to_guess) or ('letter', letter_to_guess).
    Uses pattern matching, difficulty tuning, and safety constraints.
    """
    guessed_letters = {c.upper() for c in game.guessed_letters.get(99999, [])}
    attempts_used = game.word_guess_attempts.get(99999, 0)
    attempts_left = max(0, game.max_word_guess_attempts - attempts_used)

    mask = game.discovered_masks.get(99999, [])
    target_len = len(mask)
    revealed_count = sum(1 for c in mask if c != "_")
    revealed_ratio = (revealed_count / target_len) if target_len > 0 else 0
    blanks = target_len - revealed_count

    candidates = get_bot_candidates(game)

    # 1. Full word guess check
    if attempts_left > 0 and candidates:
        should_guess_word = False
        if difficulty == "hard":
            if len(candidates) == 1 and (revealed_ratio >= 0.4 or blanks <= 4):
                should_guess_word = True
            elif len(candidates) <= 3 and (revealed_ratio >= 0.6 or blanks <= 2):
                should_guess_word = random.random() < 0.90
            elif blanks == 1:
                should_guess_word = True
        elif difficulty == "normal":
            if len(candidates) == 1 and (revealed_ratio >= 0.55 or blanks <= 3):
                should_guess_word = random.random() < 0.85
            elif len(candidates) <= 2 and (revealed_ratio >= 0.70 or blanks <= 2):
                should_guess_word = random.random() < 0.70
            elif blanks == 1 and len(candidates) <= 3:
                should_guess_word = random.random() < 0.80
        else:  # easy
            if len(candidates) == 1 and blanks <= 1:
                should_guess_word = random.random() < 0.50

        if should_guess_word:
            return "word", candidates[0]

    # 2. Letter guess
    letter = pick_bot_letter_from_candidates(candidates, guessed_letters, difficulty)
    return "letter", letter


def pick_bot_letter(game, difficulty: str = "normal") -> str:
    """Backward-compatible helper for selecting next bot letter."""
    guessed_letters = {c.upper() for c in game.guessed_letters.get(99999, [])}
    candidates = get_bot_candidates(game)
    return pick_bot_letter_from_candidates(candidates, guessed_letters, difficulty)


async def bot_turn_worker(session: RoomSession):
    """
    Simulates a smart server-side bot taking its turn with a human-like delay
    and believable difficulty strategies.
    Supports intelligent letter guessing and full-word guesses when confident.
    Guarantees turn progression never stalls.
    """
    try:
        difficulty = (session.bot_difficulty or "normal").lower()
        if difficulty == "easy":
            delay = random.uniform(1.0, 1.4)
        elif difficulty == "hard":
            delay = random.uniform(0.6, 0.9)
        else:
            delay = random.uniform(0.8, 1.2)

        await asyncio.sleep(delay)
        if not session.game or session.game.state != "PLAYING":
            return
        if session.game.current_turn_player_id != 99999:
            return

        bot_name = session.game.player2_username or "BOT"
        action_type, action_val = pick_bot_action(session.game, difficulty)

        if action_type == "word":
            ok, result_data, notice = session.game.guess_full_word(99999, action_val)
            if ok:
                await broadcast_to_room(session, "word_guess_result", {
                    "guesser_id": 99999,
                    "guesser_username": bot_name,
                    "word": result_data["word"],
                    "result": result_data["result"],
                    "attempts_left": result_data["attempts_left"],
                    "next_turn_player_id": result_data["next_turn_player_id"],
                    "game_over": result_data["game_over"]
                })
                res_str = "CORRECT! 🏆" if result_data["result"] else "INCORRECT."
                sys_msg = f"🤖 {bot_name} guessed full word '{result_data['word']}' → {res_str}"
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
                return
            else:
                logger.warning(f"Bot full word guess '{action_val}' rejected: {notice}. Falling back to letter guess.")
                action_val = pick_bot_letter(session.game, difficulty)

        # Letter Guess Execution
        ok, result_data, notice = session.game.guess_letter(99999, action_val)
        if ok:
            await broadcast_to_room(session, "guess_result", {
                "guesser_id": 99999,
                "guesser_username": bot_name,
                "letter": result_data["letter"],
                "result": result_data["result"],
                "next_turn_player_id": result_data["next_turn_player_id"],
                "game_over": result_data["game_over"],
                "positions": result_data.get("positions", [])
            })
            sys_msg = f"🤖 {bot_name} guessed '{action_val}' → {'YES' if result_data['result'] else 'NO'}."
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
        else:
            logger.warning(f"Bot letter guess '{action_val}' failed: {notice}. Triggering turn timeout to prevent hang.")
            ok_to, timeout_data, notice_to = session.game.timeout_turn()
            if ok_to:
                await broadcast_to_room(session, "turn_timeout", timeout_data)
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
        logger.error(f"Error in bot_turn_worker: {e}", exc_info=True)


def start_turn_timer(session: RoomSession):
    """
    Starts or ensures an authoritative timer for the current player's turn.
    If the player does not guess within 30s, the turn automatically switches to the other player.
    Tagged with (turn_number, current_turn_player_id, turn_started_at) to prevent stale timer races.
    """
    if not session.game or session.game.state != "PLAYING":
        cancel_turn_timer(session)
        return

    cur_turn = session.game.turn_number
    cur_player = session.game.current_turn_player_id
    cur_started = session.game.turn_started_at

    # If an active timer task is already running for this exact turn, do not reset it
    if (
        session.turn_timer_task
        and not session.turn_timer_task.done()
        and session.active_turn_timer_info
        and session.active_turn_timer_info.get("turn_number") == cur_turn
        and session.active_turn_timer_info.get("current_turn_player_id") == cur_player
    ):
        return

    cancel_turn_timer(session)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()

    # If it's the bot's turn, execute bot turn worker
    if session.game.is_bot_opponent and session.game.current_turn_player_id == 99999:
        session.active_turn_timer_info = {
            "turn_number": cur_turn,
            "current_turn_player_id": cur_player,
            "turn_started_at": cur_started
        }
        session.turn_timer_task = loop.create_task(bot_turn_worker(session))
        return

    now = datetime.datetime.now(datetime.timezone.utc)
    if cur_started:
        deadline = cur_started + datetime.timedelta(seconds=session.game.turn_timeout_seconds)
        sleep_seconds = max(0.1, (deadline - now).total_seconds())
    else:
        sleep_seconds = float(session.game.turn_timeout_seconds)

    timer_info = {
        "turn_number": cur_turn,
        "current_turn_player_id": cur_player,
        "turn_started_at": cur_started
    }
    session.active_turn_timer_info = timer_info
    logger.info(f"[TURN_TIMER_START] Room {session.room_code} Turn {cur_turn} Player {cur_player} sleeping {sleep_seconds:.1f}s")

    async def turn_timer_worker(task_info: dict, wait_time: float):
        try:
            await asyncio.sleep(wait_time)
            # Authoritative check: ensure game state, turn number, and player haven't shifted during sleep
            if (
                session.game
                and session.game.state == "PLAYING"
                and session.game.turn_number == task_info["turn_number"]
                and session.game.current_turn_player_id == task_info["current_turn_player_id"]
            ):
                logger.info(f"[TURN_TIMER_EXPIRE] Room {session.room_code} Turn {task_info['turn_number']} timed out for Player {task_info['current_turn_player_id']}")
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
            else:
                logger.info(f"[TURN_TIMER_STALE_IGNORED] Room {session.room_code} Task turn {task_info['turn_number']} vs game turn {getattr(session.game, 'turn_number', None)}")
        except asyncio.CancelledError:
            logger.info(f"[TURN_TIMER_CANCELLED] Room {session.room_code} Turn {task_info['turn_number']}")
        except Exception as e:
            logger.error(f"Error in turn_timer_worker: {e}", exc_info=True)

    session.turn_timer_task = loop.create_task(turn_timer_worker(timer_info, sleep_seconds))

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

    # Check if match has already been settled (idempotency guard)
    from app.models.coin_transaction import CoinTransaction
    from app.game.ranks import calculate_rank_from_rating, calculate_rating_change, get_rank_tier_index

    existing_tx = db.query(CoinTransaction).filter(
        CoinTransaction.reference_id == session.room_code,
        CoinTransaction.transaction_type == "MATCH_VICTORY"
    ).first()
    if existing_tx:
        logger.info(f"[Settlement] Room {session.room_code} already settled; skipping duplicate reward.")
        return

    # Update player stats & awards
    entry_fee = getattr(session, "entry_fee", None)
    if not entry_fee and db_room:
        entry_fee = getattr(db_room, "entry_fee", 10)
    if not entry_fee:
        entry_fee = 10

    pot_reward = entry_fee * 2
    winner_coins = 100
    loser_coins = 100

    winner = db.query(User).filter(User.id == winner_id).first()
    loser = db.query(User).filter(User.id == loser_id).first()

    win_delta = 25
    new_winner_rating = 825
    new_winner_rank = "Bronze III"
    old_winner_rank = "Bronze III"

    if winner:
        winner.wins += 1
        winner.xp += 100
        winner.coins = (winner.coins or 100) + entry_fee
        winner.current_streak += 1
        if winner.current_streak > winner.best_streak:
            winner.best_streak = winner.current_streak

        old_winner_rank = winner.rank or "Bronze III"
        win_delta, new_winner_rating = calculate_rating_change(
            is_winner=True,
            current_rating=winner.rating or 800,
            opponent_rating=loser.rating or 800 if loser else 800,
            win_streak=winner.current_streak
        )
        new_winner_rank = calculate_rank_from_rating(new_winner_rating)
        winner.rating = new_winner_rating
        winner.rank = new_winner_rank
        if get_rank_tier_index(new_winner_rank) > get_rank_tier_index(winner.highest_rank or "Bronze III"):
            winner.highest_rank = new_winner_rank
        winner_coins = winner.coins

        # Ledger transaction for winner reward
        win_tx = CoinTransaction(
            user_id=winner.id,
            amount=entry_fee,
            balance_after=winner.coins,
            transaction_type="MATCH_VICTORY",
            reference_id=session.room_code
        )
        db.add(win_tx)

    loss_delta = -15
    new_loser_rating = 800
    new_loser_rank = "Bronze III"
    old_loser_rank = "Bronze III"

    if loser:
        loser.losses += 1
        loser.xp += 25
        loser.coins = max(0, (loser.coins or 100) - entry_fee)
        loser.current_streak = 0

        old_loser_rank = loser.rank or "Bronze III"
        loss_delta, new_loser_rating = calculate_rating_change(
            is_winner=False,
            current_rating=loser.rating or 800,
            opponent_rating=winner.rating or 800 if winner else 800
        )
        new_loser_rank = calculate_rank_from_rating(new_loser_rating)
        loser.rating = new_loser_rating
        loser.rank = new_loser_rank
        loser_coins = loser.coins

        # Ledger transaction for loser entry fee loss
        loss_tx = CoinTransaction(
            user_id=loser.id,
            amount=-entry_fee,
            balance_after=loser.coins,
            transaction_type="ARENA_ENTRY_FEE",
            reference_id=session.room_code
        )
        db.add(loss_tx)

    # Store reward breakdown in game session for broadcasting
    session.game.rewards = {
        "entry_fee": entry_fee,
        "pot": pot_reward,
        "winner_id": winner_id,
        "winner_coins_won": entry_fee,
        "loser_coins_lost": entry_fee,
        "winner_coins": winner_coins,
        "loser_coins": loser_coins,
        "winner_rating_change": win_delta,
        "winner_rating": new_winner_rating,
        "winner_rank": new_winner_rank,
        "winner_old_rank": old_winner_rank,
        "winner_rank_up": get_rank_tier_index(new_winner_rank) > get_rank_tier_index(old_winner_rank),
        "loser_rating_change": loss_delta,
        "loser_rating": new_loser_rating,
        "loser_rank": new_loser_rank,
        "loser_old_rank": old_loser_rank,
        "loser_rank_down": get_rank_tier_index(new_loser_rank) < get_rank_tier_index(old_loser_rank)
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
        # If player is still not connected
        is_connected = session.player_connected.get(disconnected_player_id, False) or (disconnected_player_id in session.connections)
        if not is_connected and session.game and session.game.state != "GAME_OVER":
            logger.info(f"Player {disconnected_player_id} did not reconnect within 60s. Forfeiting.")
            cancel_turn_timer(session)
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

        # Track monotonic connection generations to ignore stale socket drops
        conn_gen = session.connection_generations.get(player_id, 0) + 1
        session.connection_generations[player_id] = conn_gen
        session.player_connected[player_id] = True

        # Check if returning / reconnecting
        is_reconnect = False
        if player_id in session.disconnect_tasks:
            task = session.disconnect_tasks.pop(player_id)
            if not task.done():
                task.cancel()
            is_reconnect = True
            logger.info(f"[WS_RECONNECT] Player {user.username} reconnected before forfeit timer (gen={conn_gen}).")
        elif session.game and session.game.state in ("PLAYING", "WORD_SELECTION"):
            is_reconnect = True
            logger.info(f"[WS_RECONNECT] Player {user.username} reconnected to active match (gen={conn_gen}).")

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
            await broadcast_to_room(session, "opponent_reconnected", {
                "player_id": player_id,
                "username": user.username,
                "message": f"{user.username} reconnected. Game resumed."
            }, sender_ws=websocket)
            await broadcast_to_room(session, "reconnected", {
                "player_id": player_id,
                "username": user.username,
                "message": f"{user.username} has reconnected to the duel."
            }, sender_ws=websocket)
            # Ensure turn timer is actively ticking if game is in PLAYING state
            if session.game and session.game.state == "PLAYING":
                start_turn_timer(session)
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
                hint = data.get("hint", "")
                if session.game:
                    ok, notice = session.game.lock_word(player_id, secret_word, hint)
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
            current_gen = session.connection_generations.get(user.id, 0)
            if current_gen != conn_gen:
                logger.info(f"[WS_DISCONNECT_IGNORED] Ignoring stale disconnect for {user.username} (conn_gen={conn_gen} vs active={current_gen})")
            else:
                session.player_connected[user.id] = False
                session.connections.pop(user.id, None)
                session.typing_players.discard(user.id)
                
                was_explicit = user.id in session.explicit_leaves
                logger.info(f"[WS_DISCONNECT] Player {user.username} disconnected (gen={conn_gen}, explicit={was_explicit})")
                
                # Only start the 60s disconnect grace period if it was an unexpected drop during active game
                # NOTE: We do NOT cancel session.turn_timer_task! Turn timer runs authoritatively.
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
