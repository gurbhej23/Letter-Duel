import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Guess(Base):
    __tablename__ = "guesses"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    letter = Column(String(20), nullable=False)  # Single letter, or full word guess
    is_full_word = Column(Boolean, default=False)
    result = Column(Boolean, nullable=False)  # True = YES / Correct, False = NO / Incorrect
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    game = relationship("Game")
    player = relationship("User")
