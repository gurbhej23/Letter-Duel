from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomJoin, RoomResponse, RoomLeave, QuickmatchRequest
from app.auth.deps import get_current_user
from app.game.room_manager import room_manager, RoomSession, ARENA_TIERS, UserMatchState
from app.game.engine import LetterDuelGame
from app.game.ranks import is_rank_eligible
import random

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.post("", response_model=RoomResponse)
def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entry_fee = room_in.entry_fee or 10
    if entry_fee not in ARENA_TIERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid arena entry fee. Valid tiers: {list(ARENA_TIERS.keys())}"
        )

    tier_info = ARENA_TIERS[entry_fee]
    user_coins = current_user.coins if current_user.coins is not None else 100
    user_rank = current_user.rank or "Bronze III"

    if user_coins < entry_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). You need {entry_fee} 🪙 to enter this arena."
        )

    min_rank = tier_info.get("min_rank", "Bronze III")
    if not is_rank_eligible(user_rank, min_rank):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reach {min_rank} rank to unlock this arena. (Your Rank: {user_rank})"
        )

    # Generate 6-char unique room code for PRIVATE room
    code = room_manager.create_room(
        allow_custom_words=room_in.allow_custom_words,
        is_private=True,
        entry_fee=entry_fee
    )

    db_room = Room(
        room_code=code,
        player1_id=current_user.id,
        status="WAITING",
        is_private=True,
        entry_fee=entry_fee
    )
    db.add(db_room)
    db.commit()
    db.refresh(db_room)

    return RoomResponse.model_validate(db_room)

@router.post("/quickmatch")
async def quickmatch(
    req: Optional[QuickmatchRequest] = None,
    entry_fee: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Match the player with another waiting online player in the same stake tier.
    If an opponent is waiting in the queue, join their room as player2.
    If no opponent is waiting, create a room, add to queue, and wait.
    """
    from app.websocket.handler import send_sync_states, broadcast_to_room

    chosen_fee = 10
    if req and req.entry_fee:
        chosen_fee = req.entry_fee
    elif entry_fee:
        chosen_fee = entry_fee

    if chosen_fee not in ARENA_TIERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid arena entry fee. Valid tiers: {list(ARENA_TIERS.keys())}"
        )

    tier_info = ARENA_TIERS[chosen_fee]
    user_coins = current_user.coins if current_user.coins is not None else 100
    user_rank = current_user.rank or "Bronze III"
    user_rating = current_user.rating or 800

    if user_coins < chosen_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). You need {chosen_fee} 🪙 to queue in this arena."
        )

    min_rank = tier_info.get("min_rank", "Bronze III")
    if not is_rank_eligible(user_rank, min_rank):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reach {min_rank} rank to unlock this arena. (Your Rank: {user_rank})"
        )

    # 1. Clean up any stale or abandoned rooms for this user if not in active in-memory manager
    stale_rooms = (
        db.query(Room)
        .filter(
            (Room.player1_id == current_user.id) | (Room.player2_id == current_user.id),
            Room.status.in_(["WAITING", "READY", "WORD_SELECTION", "PLAYING"])
        )
        .all()
    )
    for r in stale_rooms:
        mem_room = room_manager.get_room(r.room_code)
        # If room has no active connections in memory or is not in room_manager
        if not mem_room or len(mem_room.connections) == 0:
            if r.status in ("WAITING", "READY", "WORD_SELECTION"):
                if r.player2_id is None:
                    room_manager.remove_from_quickmatch_queue(current_user.id)
                    room_manager.remove_room(r.room_code)
                    db.delete(r)
                else:
                    r.status = "ABANDONED"
            elif r.status == "PLAYING" and not mem_room:
                r.status = "ABANDONED"
    db.commit()

    # If the user is currently in an ongoing, live PLAYING room in memory with active connections, reconnect
    live_room = (
        db.query(Room)
        .filter(
            (Room.player1_id == current_user.id) | (Room.player2_id == current_user.id),
            Room.status == "PLAYING"
        )
        .first()
    )
    if live_room:
        mem_room = room_manager.get_room(live_room.room_code)
        if mem_room and mem_room.game and mem_room.game.state == "PLAYING":
            return {
                "matched": True,
                "room_code": live_room.room_code,
                "role": "player1" if live_room.player1_id == current_user.id else "player2",
                "message": "Reconnected to active match!"
            }

    # If the user is already in the quickmatch queue, check if same fee
    if current_user.id in room_manager.quickmatch_queue:
        queued_item = room_manager.quickmatch_queue[current_user.id]
        if queued_item.get("entry_fee", 50) == chosen_fee:
            return {
                "matched": False,
                "room_code": queued_item["room_code"],
                "role": "player1",
                "message": f"Searching for an opponent in {tier_info['name']} ({chosen_fee} 🪙)..."
            }
        else:
            # Switching tiers: remove old queue entry
            await room_manager.remove_from_quickmatch_queue(current_user.id)

    # 2. Check if an opponent is waiting in the queue for this entry_fee tier
    opponent_entry = await room_manager.pop_quickmatch_opponent(
        excluding_user_id=current_user.id,
        entry_fee=chosen_fee,
        user_rating=user_rating
    )
    if opponent_entry:
        target_code = opponent_entry["room_code"]
        target_room = db.query(Room).filter(Room.room_code == target_code).first()
        if target_room and target_room.status == "WAITING" and target_room.player2_id is None:
            target_room.player2_id = current_user.id
            target_room.status = "READY"
            db.commit()
            db.refresh(target_room)

            session = room_manager.get_room(target_code)
            p1_user = db.query(User).filter(User.id == target_room.player1_id).first()
            p1_name = p1_user.username if p1_user else opponent_entry["username"]
            p1_avatar = (p1_user.avatar if p1_user else opponent_entry["avatar"]) or "avatar-1"

            if session and session.game:
                session.game.add_player2(current_user.id, current_user.username, current_user.avatar or "avatar-2")
                # Auto-ready both players for global multiplayer and advance directly to WORD_SELECTION
                session.game.ready_players.add(target_room.player1_id)
                session.game.ready_players.add(current_user.id)
                session.game.state = "WORD_SELECTION"
                await broadcast_to_room(session, "game_starting", {
                    "message": f"Duel matched with {current_user.username}! Choose your secret word."
                })
                await send_sync_states(session)

            return {
                "matched": True,
                "room_code": target_code,
                "role": "player2",
                "opponent": {
                    "id": target_room.player1_id,
                    "username": p1_name,
                    "avatar": p1_avatar
                },
                "message": f"Opponent {p1_name} found! Match starting..."
            }

    # 3. No opponent currently waiting: create a new room (is_private=False) and wait
    code = room_manager.create_room(allow_custom_words=True, is_private=False, entry_fee=chosen_fee)
    new_room = Room(
        room_code=code,
        player1_id=current_user.id,
        status="WAITING",
        is_private=False,
        entry_fee=chosen_fee
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)

    await room_manager.add_to_quickmatch_queue(
        user_id=current_user.id,
        username=current_user.username,
        avatar=current_user.avatar or "avatar-1",
        room_code=code,
        entry_fee=chosen_fee,
        rating=user_rating
    )

    return {
        "matched": False,
        "room_code": code,
        "role": "player1",
        "message": f"Searching for an opponent in {tier_info['name']} ({chosen_fee} 🪙)..."
    }

class BotMatchRequest(BaseModel):
    entry_fee: Optional[int] = 10
    difficulty: Optional[str] = "normal"  # easy, normal, hard

@router.post("/bot")
async def start_bot_match(
    req: Optional[BotMatchRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Start a 1v1 duel against a server-authoritative BOT participant.
    """
    from app.game.words import STANDARD_DICTIONARY
    from app.game.definitions import get_word_definition

    chosen_fee = (req.entry_fee if req and req.entry_fee else 10) or 10
    difficulty = (req.difficulty if req and req.difficulty else "normal").lower()
    if difficulty not in ("easy", "normal", "hard"):
        difficulty = "normal"

    if chosen_fee not in ARENA_TIERS:
        chosen_fee = 10

    tier_info = ARENA_TIERS[chosen_fee]
    user_coins = current_user.coins if current_user.coins is not None else 100
    user_rank = current_user.rank or "Bronze III"

    if user_coins < chosen_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). You need {chosen_fee} 🪙 to enter."
        )

    min_rank = tier_info.get("min_rank", "Bronze III")
    if not is_rank_eligible(user_rank, min_rank):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reach {min_rank} rank to unlock this arena. (Your Rank: {user_rank})"
        )

    # Clean up any existing queue entries for this user
    await room_manager.remove_from_quickmatch_queue(current_user.id)

    code = room_manager.create_room(allow_custom_words=True, is_private=False, entry_fee=chosen_fee)
    
    # Ensure Bot user exists in DB
    bot_user = db.query(User).filter(User.id == 99999).first()
    if not bot_user:
        bot_user = User(
            id=99999,
            username="BOT",
            email="bot@letterduel.internal",
            password_hash="system_bot_disabled_login",
            avatar="avatar-robot",
            coins=10000,
            rating=800,
            rank="Bronze III"
        )
        db.add(bot_user)
        db.commit()

    db_room = Room(
        room_code=code,
        player1_id=current_user.id,
        player2_id=99999,
        status="READY",
        is_private=False,
        entry_fee=chosen_fee
    )
    db.add(db_room)
    db.commit()
    db.refresh(db_room)

    session = room_manager.get_room(code)
    if session:
        session.is_bot_opponent = True
        session.bot_difficulty = difficulty
        bot_name = f"BOT ({difficulty.capitalize()})"
        session.game = LetterDuelGame(
            room_code=code,
            player1_id=current_user.id,
            player2_id=99999,
            player1_username=current_user.username,
            player2_username=bot_name,
            player1_avatar=current_user.avatar or "avatar-1",
            player2_avatar="avatar-robot",
            allow_custom_words=True,
            bot_difficulty=difficulty
        )
        session.game.is_bot_opponent = True
        session.game.bot_difficulty = difficulty

        # Pick random secret word for bot from standard words (5-9 letters)
        valid_words = [w.upper() for w in STANDARD_DICTIONARY if 5 <= len(w) <= 9 and w.isalpha()]
        bot_word = random.choice(valid_words) if valid_words else "DRAGON"
        session.game.secret_words[99999] = bot_word
        session.game.word_lengths[99999] = len(bot_word)
        session.game.word_hints[99999] = get_word_definition(bot_word)

        # Bot is immediately ready
        session.game.ready_players.add(current_user.id)
        session.game.ready_players.add(99999)
        session.game.state = "WORD_SELECTION"
        room_manager.set_user_state(current_user.id, UserMatchState.PLAYING, code)

    return {
        "matched": True,
        "room_code": code,
        "role": "player1",
        "is_bot": True,
        "difficulty": difficulty,
        "opponent": {
            "id": 99999,
            "username": f"BOT ({difficulty.capitalize()})",
            "avatar": "avatar-robot"
        },
        "message": f"Duel matched with BOT ({difficulty.capitalize()})! Choose your secret word."
    }

@router.post("/quickmatch/cancel")
async def cancel_quickmatch(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel matchmaking search and clean up waiting room."""
    await room_manager.remove_from_quickmatch_queue(current_user.id)

    waiting_rooms = (
        db.query(Room)
        .filter(
            Room.player1_id == current_user.id,
            (Room.player2_id.is_(None) | (Room.player2_id == 99999)),
            Room.status.in_(["WAITING", "READY"])
        )
        .all()
    )
    for waiting_room in waiting_rooms:
        code = waiting_room.room_code
        db.delete(waiting_room)
        room_manager.remove_room(code)
    db.commit()

    room_manager.set_user_state(current_user.id, UserMatchState.AVAILABLE)
    return {"status": "cancelled", "message": "Matchmaking search cancelled."}

@router.post("/leave")
async def leave_room(
    leave_in: Optional[RoomLeave] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Explicitly leaves a room/lobby. Cleans up DB records and room manager sessions
    so the user is NEVER re-routed back to the room on page refresh.
    """
    await room_manager.remove_from_quickmatch_queue(current_user.id)

    query = db.query(Room).filter(
        (Room.player1_id == current_user.id) | (Room.player2_id == current_user.id),
        Room.status.in_(["WAITING", "READY", "WORD_SELECTION", "PLAYING"])
    )
    if leave_in and leave_in.room_code:
        query = query.filter(Room.room_code == leave_in.room_code.upper())

    rooms = query.all()
    for r in rooms:
        code = r.room_code
        session = room_manager.get_room(code)

        if r.status in ("WAITING", "READY"):
            if r.player1_id == current_user.id:
                # Host left in lobby: delete or abandon the room
                if r.player2_id is None or r.player2_id == 99999:
                    db.delete(r)
                else:
                    r.status = "ABANDONED"
                room_manager.remove_room(code)
            elif r.player2_id == current_user.id:
                # Guest left in lobby
                r.player2_id = None
                r.status = "WAITING"
                if session and session.game:
                    session.game.player2_id = None
                    session.game.player2_username = None
                    session.game.state = "WAITING"
        elif r.status in ("WORD_SELECTION", "PLAYING"):
            # If in active game, mark game over / forfeit
            r.status = "GAME_OVER"
            if session:
                session.explicit_leaves.add(current_user.id)
                if session.game:
                    session.game.forfeit(current_user.id, reason="FORFEIT_SURRENDER")

    db.commit()
    return {"status": "success", "message": "Left room cleanly."}

def get_active_room_helper(current_user: User, db: Session) -> dict:
    """
    Check if the authenticated user has an active room or ongoing duel.
    Returns authoritative recovery info, remaining grace seconds, and public opponent info.
    NEVER sends secret word!
    """
    import time
    active_room = (
        db.query(Room)
        .filter(
            (Room.player1_id == current_user.id) | (Room.player2_id == current_user.id),
            Room.status.in_(["WAITING", "READY", "WORD_SELECTION", "PLAYING"])
        )
        .order_by(Room.created_at.desc())
        .first()
    )
    if not active_room:
        return {"active": False, "has_active_room": False}

    session = room_manager.get_room(active_room.room_code)
    # If in WAITING for human player, check if user is still in session or within grace
    if active_room.status == "WAITING" and not (session and getattr(session, "is_bot_opponent", False)):
        if not session or (current_user.id not in session.connections and current_user.id not in session.disconnect_deadlines):
            return {"active": False, "has_active_room": False, "room_code": None, "status": None, "is_host": False}
        return {
            "active": True,
            "has_active_room": True,
            "room_code": active_room.room_code,
            "status": active_room.status,
            "can_rejoin": True,
            "is_host": (active_room.player1_id == current_user.id),
            "is_private": session.is_private if session else getattr(active_room, "is_private", True),
            "entry_fee": getattr(session, "entry_fee", None) or getattr(active_room, "entry_fee", 50)
        }

    # In active duel (READY with bot, WORD_SELECTION or PLAYING)
    if not session or not session.game or session.game.state == "GAME_OVER":
        return {"active": False, "has_active_room": False}

    # Check if disconnected and if grace period has expired
    remaining_seconds = 60
    if current_user.id in session.disconnect_deadlines:
        deadline = session.disconnect_deadlines[current_user.id]
        diff = deadline - time.time()
        if diff <= 0:
            # Grace period expired
            return {"active": False, "has_active_room": False, "message": "Grace period expired."}
        remaining_seconds = max(1, int(round(diff)))
    elif current_user.id not in session.connections:
        remaining_seconds = 60

    is_p1 = (active_room.player1_id == current_user.id)
    opp_user = active_room.player2 if is_p1 else active_room.player1
    opp_name = opp_user.username if opp_user else ("BOT" if getattr(session.game, "is_bot_opponent", False) else "Challenger")
    opp_avatar = opp_user.avatar if opp_user else ("avatar-robot" if getattr(session.game, "is_bot_opponent", False) else "avatar-1")

    return {
        "active": True,
        "has_active_room": True,
        "room_code": active_room.room_code,
        "room_id": active_room.room_code,
        "status": session.game.state.lower(),
        "game_state": session.game.state,
        "can_rejoin": True,
        "remaining_seconds": remaining_seconds,
        "is_bot": getattr(session.game, "is_bot_opponent", False),
        "difficulty": getattr(session.game, "bot_difficulty", "normal"),
        "opponent": {
            "id": opp_user.id if opp_user else 99999,
            "username": opp_name,
            "avatar": opp_avatar
        },
        "is_host": is_p1,
        "entry_fee": getattr(session, "entry_fee", None) or getattr(active_room, "entry_fee", 10)
    }

@router.get("/active")
def get_active_room(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return get_active_room_helper(current_user, db)

@router.post("/join", response_model=RoomResponse)
def join_room(
    join_in: RoomJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code = join_in.room_code.strip().upper()
    db_room = db.query(Room).filter(Room.room_code == code).first()

    if not db_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found. Check your 6-character code."
        )

    # If user is already player1 or player2, allow re-entry
    if db_room.player1_id == current_user.id:
        return RoomResponse.model_validate(db_room)

    if db_room.player2_id == current_user.id:
        return RoomResponse.model_validate(db_room)

    # Room is full (strictly 2 players)
    if db_room.player2_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room is full."
        )

    if db_room.status in ("GAME_OVER", "EXPIRED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This room has already concluded or expired."
        )

    # Validate coins and rank for joining guest
    room_fee = getattr(db_room, "entry_fee", 10) or 10
    user_coins = current_user.coins if current_user.coins is not None else 100
    user_rank = current_user.rank or "Bronze III"
    tier_info = ARENA_TIERS.get(room_fee, {"min_rank": "Bronze III", "name": "Duel Arena"})

    if user_coins < room_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). Room stake is {room_fee} 🪙."
        )

    min_rank = tier_info.get("min_rank", "Bronze III")
    if not is_rank_eligible(user_rank, min_rank):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reach {min_rank} rank to join this arena. (Your Rank: {user_rank})"
        )

    db_room.player2_id = current_user.id
    db_room.status = "READY"
    db.commit()
    db.refresh(db_room)

    # Ensure in-memory session exists
    session = room_manager.get_room(code)
    if not session:
        session = RoomSession(
            room_code=code,
            allow_custom_words=True,
            is_private=getattr(db_room, "is_private", True),
            entry_fee=room_fee
        )
        room_manager.rooms[code] = session
    else:
        session.entry_fee = room_fee

    return RoomResponse.model_validate(db_room)

@router.get("/{room_code}", response_model=RoomResponse)
def get_room(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    code = room_code.strip().upper()
    db_room = db.query(Room).filter(Room.room_code == code).first()
    if not db_room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found."
        )
    return RoomResponse.model_validate(db_room)
