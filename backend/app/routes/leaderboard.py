from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.models.user import User
from app.schemas.game import LeaderboardEntry

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

@router.get("", response_model=List[LeaderboardEntry])
def get_leaderboard(limit: int = 50, db: Session = Depends(get_db)):
    users = (
        db.query(User)
        .filter(
            ~User.email.ilike("%@letterduel.gg"),
            ~User.email.ilike("%@test.com"),
            ~User.email.ilike("%@example.com"),
            ~User.username.ilike("%test%"),
            ~User.username.ilike("%bot%"),
            ~User.username.ilike("%tourney%"),
            ~User.username.ilike("%forfeit%"),
            ~User.username.ilike("%flowuser%"),
            ~User.username.ilike("%duelist_%"),
            ~User.username.ilike("%poor_%"),
            ~User.username.ilike("%guest_%"),
            ~User.username.ilike("%user_%"),
            ~User.username.ilike("%winner_%"),
            ~User.username.ilike("%loser_%"),
            User.wins > 0
        )
        .order_by(desc(User.rating), desc(User.wins))
        .limit(limit)
        .all()
    )

    entries = []
    for rank, user in enumerate(users, start=1):
        total_games = user.wins + user.losses
        win_rate = round((user.wins / total_games * 100), 1) if total_games > 0 else 0.0
        entries.append(LeaderboardEntry(
            rank=rank,
            user_id=user.id,
            username=user.username,
            avatar=user.avatar or "avatar-1",
            wins=user.wins,
            losses=user.losses,
            win_rate=win_rate,
            current_streak=user.current_streak,
            best_streak=user.best_streak,
            xp=user.xp,
            player_rank=user.rank or "Bronze III"
        ))
    return entries
