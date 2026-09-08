from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.tournament import Tournament, TournamentParticipant, TournamentMatch
from app.schemas.tournament import (
    TournamentDetailResponse,
    TournamentHistoryEntry
)
from app.auth.deps import get_current_user
from app.game.tournament_manager import tournament_manager, TOURNAMENT_REWARDS

router = APIRouter(prefix="/tournaments", tags=["tournaments"])

@router.get("/active", response_model=TournamentDetailResponse)
def get_active_tournament(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns the user's current tournament if already in one,
    or the active WAITING tournament for registration.
    """
    # 1. Check if user is currently inside an active/waiting tournament
    user_tourney = tournament_manager.get_user_active_tournament(current_user.id, db)
    if user_tourney:
        return tournament_manager.get_tournament_details(user_tourney.id, db)

    # 2. Otherwise return (or create) the public WAITING tournament
    waiting_tourney = tournament_manager.get_or_create_active_tournament(db)
    return tournament_manager.get_tournament_details(waiting_tourney.id, db)

@router.get("/history", response_model=List[TournamentHistoryEntry])
def get_tournament_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns past finished tournaments the user participated in."""
    records = (
        db.query(TournamentParticipant)
        .join(Tournament, Tournament.id == TournamentParticipant.tournament_id)
        .filter(
            TournamentParticipant.user_id == current_user.id,
            Tournament.status == "FINISHED"
        )
        .order_by(Tournament.finished_at.desc())
        .limit(20)
        .all()
    )

    history_entries = []
    for r in records:
        t = r.tournament
        placement = r.placement or 5
        title = TOURNAMENT_REWARDS.get(placement, {}).get("title", "Participant")
        winner_name = t.winner.username if t.winner else "Unknown"

        history_entries.append(TournamentHistoryEntry(
            tournament_id=t.id,
            tournament_name=t.name,
            status=t.status,
            placement=placement,
            placement_title=title,
            coins_awarded=r.coins_awarded,
            xp_awarded=r.xp_awarded,
            winner_username=winner_name,
            date=t.finished_at or t.created_at
        ))

    return history_entries

@router.get("/{tournament_id}", response_model=TournamentDetailResponse)
def get_tournament_by_id(
    tournament_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fetch bracket and participant details for a specific tournament."""
    tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tourney:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tournament not found"
        )
    return tournament_manager.get_tournament_details(tourney.id, db)

@router.post("/{tournament_id}/join", response_model=TournamentDetailResponse)
async def join_tournament(
    tournament_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Join the tournament queue."""
    try:
        details = await tournament_manager.join_tournament(tournament_id, current_user, db)
        return details
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/{tournament_id}/leave")
async def leave_tournament(
    tournament_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Leave the waiting tournament queue."""
    try:
        res = await tournament_manager.leave_tournament(tournament_id, current_user.id, db)
        return res
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
