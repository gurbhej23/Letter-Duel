from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserResponse

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: str
    avatar: str
    wins: int
    losses: int
    win_rate: float
    current_streak: int
    best_streak: int
    xp: int

class MatchHistoryEntry(BaseModel):
    id: int
    opponent_username: str
    opponent_avatar: str
    result: str  # "WIN" or "LOSS"
    my_word_length: int
    opponent_word_length: int
    secret_word_revealed: Optional[str] = None
    duration_seconds: int
    guesses_count: int
    ended_at: datetime

class ChatMessageResponse(BaseModel):
    id: int
    room_id: int
    sender_id: Optional[int]
    sender_username: Optional[str] = None
    message: str
    is_system: bool
    created_at: datetime
