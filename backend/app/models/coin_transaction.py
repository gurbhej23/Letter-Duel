import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class CoinTransaction(Base):
    __tablename__ = "coin_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # positive for credit, negative for debit
    balance_after = Column(Integer, nullable=False)
    transaction_type = Column(String(50), nullable=False, index=True)  # WELCOME_BONUS, ARENA_ENTRY_FEE, MATCH_VICTORY, DAILY_BONUS, TOURNAMENT_PRIZE
    reference_id = Column(String(100), nullable=True, index=True)  # room_code, match_id, or "registration"
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    user = relationship("User", foreign_keys=[user_id])
