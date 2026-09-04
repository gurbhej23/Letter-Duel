from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from app.database import get_db
from app.models.user import User
from app.models.game import Game
from app.models.guess import Guess
from app.schemas.game import MatchHistoryEntry
from app.auth.deps import get_current_user

router = APIRouter(prefix="/history", tags=["history"])

@router.get("", response_model=List[MatchHistoryEntry])
def get_match_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    games = db.query(Game).filter(
        or_(Game.player1_id == current_user.id, Game.player2_id == current_user.id),
        Game.ended_at.isnot(None)
    ).order_by(desc(Game.ended_at)).limit(30).all()

    entries = []
    for g in games:
        is_p1 = (g.player1_id == current_user.id)
        opponent = g.player2 if is_p1 else g.player1
        my_len = g.player1_word_length if is_p1 else g.player2_word_length
        opp_len = g.player2_word_length if is_p1 else g.player1_word_length
        
        # Result
        result = "WIN" if g.winner_id == current_user.id else "LOSS"

        # Duration
        duration_sec = 0
        if g.started_at and g.ended_at:
            duration_sec = int((g.ended_at - g.started_at).total_seconds())
        if duration_sec < 0:
            duration_sec = 0

        # Guesses count
        guesses_count = db.query(Guess).filter(Guess.game_id == g.id, Guess.player_id == current_user.id).count()

        entries.append(MatchHistoryEntry(
            id=g.id,
            opponent_username=opponent.username if opponent else "Opponent",
            opponent_avatar=opponent.avatar if opponent else "avatar-2",
            result=result,
            my_word_length=my_len,
            opponent_word_length=opp_len,
            duration_seconds=duration_sec,
            guesses_count=guesses_count,
            ended_at=g.ended_at
        ))

    return entries
