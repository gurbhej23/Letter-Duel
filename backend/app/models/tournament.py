import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), default="Letter Duel Championship")
    status = Column(String(30), default="WAITING")  # WAITING, IN_PROGRESS, FINISHED, CANCELLED
    max_players = Column(Integer, default=8)
    current_players = Column(Integer, default=0)
    winner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    winner = relationship("User", foreign_keys=[winner_id])
    participants = relationship("TournamentParticipant", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("TournamentMatch", back_populates="tournament", cascade="all, delete-orphan")


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    seed = Column(Integer, nullable=True)  # 1 to 8
    status = Column(String(30), default="WAITING")  # WAITING, ACTIVE, ELIMINATED, CHAMPION
    eliminated = Column(Boolean, default=False)
    placement = Column(Integer, nullable=True)  # 1=Champion, 2=Runner-up, 3=Semi, 5=Quarter
    coins_awarded = Column(Integer, default=0)
    xp_awarded = Column(Integer, default=0)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    tournament = relationship("Tournament", back_populates="participants")
    user = relationship("User")


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False, index=True)
    round = Column(Integer, nullable=False)  # 1 = Quarterfinals, 2 = Semifinals, 3 = Final
    match_number = Column(Integer, nullable=False)  # 1..7
    player1_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    player2_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    winner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    room_code = Column(String(8), nullable=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=True)
    status = Column(String(30), default="LOCKED")  # LOCKED, WAITING, READY, LIVE, COMPLETED
    next_match_id = Column(Integer, nullable=True)
    next_match_slot = Column(Integer, nullable=True)  # 1 or 2
    checkin_deadline = Column(DateTime, nullable=True)
    is_forfeit = Column(Boolean, default=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    tournament = relationship("Tournament", back_populates="matches")
    player1 = relationship("User", foreign_keys=[player1_id])
    player2 = relationship("User", foreign_keys=[player2_id])
    winner = relationship("User", foreign_keys=[winner_id])
    game = relationship("Game", foreign_keys=[game_id])
