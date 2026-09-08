from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomJoin, RoomResponse, RoomLeave, QuickmatchRequest
from app.auth.deps import get_current_user
from app.game.room_manager import room_manager, RoomSession, ARENA_TIERS
from app.game.engine import LetterDuelGame
import random

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.post("", response_model=RoomResponse)
def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    entry_fee = room_in.entry_fee or 50
    if entry_fee not in ARENA_TIERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid arena entry fee. Valid tiers: {list(ARENA_TIERS.keys())}"
        )

    tier_info = ARENA_TIERS[entry_fee]
    user_coins = current_user.coins if current_user.coins is not None else 500
    user_level = current_user.level or 1

    if user_coins < entry_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). You need {entry_fee} 🪙 to enter this arena."
        )

    if user_level < tier_info["min_level"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This {tier_info['name']} requires Level {tier_info['min_level']} to unlock (Current: Lv. {user_level}). Keep dueling to level up!"
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

    chosen_fee = 50
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
    user_coins = current_user.coins if current_user.coins is not None else 500
    user_level = current_user.level or 1

    if user_coins < chosen_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). You need {chosen_fee} 🪙 to queue in this arena."
        )

    if user_level < tier_info["min_level"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This {tier_info['name']} requires Level {tier_info['min_level']} to unlock (Current: Lv. {user_level}). Keep dueling to level up!"
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
    opponent_entry = await room_manager.pop_quickmatch_opponent(excluding_user_id=current_user.id, entry_fee=chosen_fee)
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
        entry_fee=chosen_fee
    )

    return {
        "matched": False,
        "room_code": code,
        "role": "player1",
        "message": f"Searching for an opponent in {tier_info['name']} ({chosen_fee} 🪙)..."
    }

@router.post("/quickmatch/cancel")
async def cancel_quickmatch(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel matchmaking search and clean up waiting room."""
    await room_manager.remove_from_quickmatch_queue(current_user.id)

    waiting_room = (
        db.query(Room)
        .filter(
            Room.player1_id == current_user.id,
            Room.player2_id.is_(None),
            Room.status == "WAITING"
        )
        .first()
    )
    if waiting_room:
        code = waiting_room.room_code
        db.delete(waiting_room)
        db.commit()
        room_manager.remove_room(code)

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

@router.get("/active")
def get_active_room(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if the authenticated user has an active room or ongoing duel."""
    active_room = (
        db.query(Room)
        .filter(
            (Room.player1_id == current_user.id) | (Room.player2_id == current_user.id),
            Room.status.in_(["WAITING", "READY", "WORD_SELECTION", "PLAYING"])
        )
        .order_by(Room.created_at.desc())
        .first()
    )
    if active_room:
        session = room_manager.get_room(active_room.room_code)
        # If in WAITING or READY, only consider active if user has an active websocket connection in memory
        if active_room.status in ("WAITING", "READY"):
            if not session or current_user.id not in session.connections:
                return {"has_active_room": False, "room_code": None, "status": None, "is_host": False}
        elif active_room.status in ("WORD_SELECTION", "PLAYING"):
            if not session:
                return {"has_active_room": False, "room_code": None, "status": None, "is_host": False}

        return {
            "has_active_room": True,
            "room_code": active_room.room_code,
            "status": active_room.status,
            "is_host": (active_room.player1_id == current_user.id),
            "is_private": session.is_private if session else getattr(active_room, "is_private", True),
            "entry_fee": getattr(session, "entry_fee", None) or getattr(active_room, "entry_fee", 50)
        }
    return {"has_active_room": False, "room_code": None, "status": None, "is_host": False, "entry_fee": 50}

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

    # Validate coins and level for joining guest
    room_fee = getattr(db_room, "entry_fee", 50) or 50
    user_coins = current_user.coins if current_user.coins is not None else 500
    user_level = current_user.level or 1
    tier_info = ARENA_TIERS.get(room_fee, {"min_level": 1, "name": "Duel Arena"})

    if user_coins < room_fee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins ({user_coins} 🪙). Room stake is {room_fee} 🪙."
        )

    if user_level < tier_info["min_level"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This {tier_info['name']} requires Level {tier_info['min_level']} to join (Your Level: {user_level}). Keep dueling to level up!"
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
