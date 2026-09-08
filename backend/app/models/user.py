import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    avatar = Column(String(255), default="avatar-1")
    coins = Column(Integer, default=100)
    level = Column(Integer, default=1)  # Safely deprecated: retained for backward compatibility
    rating = Column(Integer, default=800)  # Hidden MMR
    rank = Column(String(30), default="Bronze III")  # Competitive Rank
    highest_rank = Column(String(30), default="Bronze III")
    welcome_bonus_claimed = Column(Boolean, default=True)
    xp = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)
    best_streak = Column(Integer, default=0)
    last_daily_bonus = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
