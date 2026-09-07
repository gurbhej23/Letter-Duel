import asyncio
import datetime
import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class PresenceManager:
    """
    Authoritative real-time presence manager tracking active online users
    via their established WebSocket connections.
    """
    def __init__(self):
        # user_id -> Set of active WebSocket connections (supports multiple tabs)
        self._connections: Dict[int, Set[WebSocket]] = {}
        # user_id -> last activity UTC timestamp
        self._last_seen: Dict[int, datetime.datetime] = {}
        self._lock = asyncio.Lock()

    def touch_user(self, user_id: int):
        """Update last seen timestamp for a user."""
        self._last_seen[user_id] = datetime.datetime.now(datetime.timezone.utc)

    async def add_connection(self, user_id: int, websocket: WebSocket):
        """Register an active WebSocket connection for a user."""
        async with self._lock:
            if user_id not in self._connections:
                self._connections[user_id] = set()
            self._connections[user_id].add(websocket)
            self.touch_user(user_id)
        
        logger.info(f"[Presence] User {user_id} connected. Total online: {self.get_online_count()}")
        await self.broadcast_presence_update()

    async def remove_connection(self, user_id: int, websocket: WebSocket):
        """Remove a closed WebSocket connection for a user."""
        async with self._lock:
            if user_id in self._connections:
                self._connections[user_id].discard(websocket)
                if not self._connections[user_id]:
                    del self._connections[user_id]
            self.touch_user(user_id)

        logger.info(f"[Presence] User {user_id} disconnected. Total online: {self.get_online_count()}")
        await self.broadcast_presence_update()

    def is_user_online(self, user_id: int) -> bool:
        """
        A user is truly online if they have at least one active WebSocket connection
        or had verified activity within the last 45 seconds.
        """
        if user_id in self._connections and len(self._connections[user_id]) > 0:
            return True
        last = self._last_seen.get(user_id)
        if not last:
            return False
        diff = (datetime.datetime.now(datetime.timezone.utc) - last).total_seconds()
        return diff < 45

    def get_online_user_ids(self) -> Set[int]:
        """Return set of currently verified online user IDs."""
        now = datetime.datetime.now(datetime.timezone.utc)
        online = set(self._connections.keys())
        for uid, last in list(self._last_seen.items()):
            if (now - last).total_seconds() < 45:
                online.add(uid)
        return online

    def get_online_count(self) -> int:
        """Return exact count of verified online users."""
        return len(self.get_online_user_ids())

    async def broadcast_presence_update(self):
        """Broadcast real-time online_count to every active WebSocket connection."""
        count = self.get_online_count()
        payload = json.dumps({
            "type": "presence_update",
            "data": {
                "online_count": count
            }
        })
        
        # Collect all active socket instances
        all_sockets: Set[WebSocket] = set()
        for sockets in list(self._connections.values()):
            all_sockets.update(sockets)

        for ws in list(all_sockets):
            try:
                await ws.send_text(payload)
            except Exception:
                pass

presence_manager = PresenceManager()
