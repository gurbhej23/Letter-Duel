import json
import logging
import datetime
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.auth.deps import get_user_from_token
from app.models.user import User
from app.models.tournament import Tournament
from app.game.tournament_manager import tournament_manager

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/tournament/{tournament_id}")
async def websocket_tournament_endpoint(
    websocket: WebSocket,
    tournament_id: int,
    token: Optional[str] = Query(None)
):
    await websocket.accept()

    db: Session = SessionLocal()
    user: Optional[User] = None
    try:
        user = get_user_from_token(token, db) if token else None
        if not user:
            await websocket.send_text(json.dumps({"type": "error", "data": {"message": "Invalid authentication token."}}))
            await websocket.close()
            return

        tourney = db.query(Tournament).filter(Tournament.id == tournament_id).first()
        if not tourney:
            await websocket.send_text(json.dumps({"type": "error", "data": {"message": "Tournament not found."}}))
            await websocket.close()
            return

        tournament_manager.register_connection(tournament_id, user.id, websocket)
        logger.info(f"User {user.username} connected to tournament {tournament_id} WebSocket.")

        # Send initial full tournament state
        details = tournament_manager.get_tournament_details(tournament_id, db)
        await websocket.send_text(json.dumps({
            "type": "tournament_sync",
            "data": details
        }))

        # Message loop (e.g. tournament lobby chat)
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
            except Exception:
                continue

            msg_type = msg.get("type")
            data = msg.get("data", {})

            if msg_type == "tournament_chat":
                raw_msg = (data.get("message") or "").strip()
                if raw_msg:
                    clean_msg = raw_msg[:300]
                    chat_payload = {
                        "sender_id": user.id,
                        "sender_username": user.username,
                        "sender_avatar": user.avatar or "avatar-1",
                        "message": clean_msg,
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                    }
                    await tournament_manager.broadcast_to_tournament(tournament_id, "tournament_chat", chat_payload)

    except WebSocketDisconnect:
        logger.info(f"User {user.username if user else 'Unknown'} disconnected from tournament {tournament_id}.")
    except Exception as e:
        logger.error(f"Error in tournament websocket: {e}")
    finally:
        if user:
            tournament_manager.unregister_connection(tournament_id, user.id)
        db.close()
