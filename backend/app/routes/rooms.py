from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomJoin, RoomResponse
from app.auth.deps import get_current_user
from app.game.room_manager import room_manager

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.post("", response_model=RoomResponse)
def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Generate 6-char unique room code
    code = room_manager.create_room(allow_custom_words=room_in.allow_custom_words)

    db_room = Room(
        room_code=code,
        player1_id=current_user.id,
        status="WAITING"
    )
    db.add(db_room)
    db.commit()
    db.refresh(db_room)

    return RoomResponse.model_validate(db_room)

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

    # Room is full
    if db_room.player2_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room is full. Exactly two players allowed in a Letter Duel."
        )

    if db_room.status in ("GAME_OVER", "EXPIRED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This room has already concluded or expired."
        )

    db_room.player2_id = current_user.id
    db_room.status = "READY"
    db.commit()
    db.refresh(db_room)

    # Ensure in-memory session exists
    session = room_manager.get_room(code)
    if not session:
        room_manager.rooms[code] = room_manager.create_room()

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
