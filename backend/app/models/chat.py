import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Null for system messages
    message = Column(String(500), nullable=False)
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    room = relationship("Room")
    sender = relationship("User")
