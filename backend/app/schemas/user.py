from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    avatar: Optional[str] = "avatar-1"

class UserLogin(BaseModel):
    username_or_email: str
    password: str
    remember_me: bool = False

class UserProfileUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=30)
    avatar: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    avatar: str
    coins: int = 500
    level: int = 1
    xp: int = 0
    wins: int
    losses: int
    current_streak: int
    best_streak: int
    last_daily_bonus: Optional[datetime] = None
    created_at: datetime
    last_seen: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
