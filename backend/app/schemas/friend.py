from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserResponse

class FriendRequestCreate(BaseModel):
    receiver_username: str

class FriendshipResponse(BaseModel):
    id: int
    requester_id: int
    receiver_id: int
    status: str
    created_at: datetime
    requester: UserResponse
    receiver: UserResponse

    class Config:
        from_attributes = True

class FriendItem(BaseModel):
    friendship_id: int
    user: UserResponse
    status: str  # online, in-game, offline
