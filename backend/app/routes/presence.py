from fastapi import APIRouter
from app.game.presence import presence_manager
from app.game.room_manager import room_manager

router = APIRouter(prefix="/presence", tags=["presence"])

@router.get("/stats")
def get_presence_stats():
    """
    Returns real-time online presence stats:
    - online_count: verified connected players
    - searching_count: players currently in matchmaking queue
    """
    return {
        "online_count": presence_manager.get_online_count(),
        "searching_count": room_manager.get_queue_count()
    }
