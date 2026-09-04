from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserResponse

class RoomCreate(BaseModel):
    allow_custom_words: bool = True

class RoomJoin(BaseModel):
    room_code: str

class RoomResponse(BaseModel):
    id: int
    room_code: str
    player1_id: int
    player2_id: Optional[int] = None
    status: str
    created_at: datetime
    player1: Optional[UserResponse] = None
    player2: Optional[UserResponse] = None

    class Config:
        from_attributes = True
