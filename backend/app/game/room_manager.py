import asyncio
import datetime
import random
import string
from typing import Dict, Optional, Set
from fastapi import WebSocket
from app.game.engine import LetterDuelGame
from app.config import settings

def generate_room_code(length: int = 6) -> str:
    """Generate a random, non-sequential, secure 6-character room code."""
    # Exclude ambiguous characters like 0, O, 1, I
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(random.choice(chars) for _ in range(length))

class RoomSession:
    def __init__(self, room_code: str, allow_custom_words: bool = True, is_private: bool = True):
        self.room_code = room_code
        self.allow_custom_words = allow_custom_words
        self.is_private = is_private
        self.game: Optional[LetterDuelGame] = None
        
        # Connected WebSockets: player_id -> WebSocket
        self.connections: Dict[int, WebSocket] = {}
        
        # Disconnect timers: player_id -> asyncio.Task
        self.disconnect_tasks: Dict[int, asyncio.Task] = {}
        self.disconnect_start_time: Dict[int, float] = {}

        # Turn timer: 1 minute (60s) per guess
        self.turn_timer_task: Optional[asyncio.Task] = None

        # Typing indicators: set of player_ids currently typing
        self.typing_players: Set[int] = set()

        # Players who intentionally left or surrendered
        self.explicit_leaves: Set[int] = set()

        # Database Game record ID once match starts
        self.db_game_id: Optional[int] = None
        self.created_at = datetime.datetime.now(datetime.timezone.utc)

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, RoomSession] = {}
        # Quickmatch queue: user_id -> {"user_id": user_id, "room_code": room_code, "created_at": datetime}
        self.quickmatch_queue: Dict[int, dict] = {}

    def create_room(self, allow_custom_words: bool = True, is_private: bool = True) -> str:
        code = generate_room_code()
        while code in self.rooms:
            code = generate_room_code()
        self.rooms[code] = RoomSession(room_code=code, allow_custom_words=allow_custom_words, is_private=is_private)
        return code

    def get_room(self, room_code: str) -> Optional[RoomSession]:
        return self.rooms.get(room_code.upper())

    def remove_room(self, room_code: str):
        code = room_code.upper()
        if code in self.rooms:
            session = self.rooms[code]
            if session.turn_timer_task and not session.turn_timer_task.done():
                session.turn_timer_task.cancel()
            for task in session.disconnect_tasks.values():
                if not task.done():
                    task.cancel()
            del self.rooms[code]

    def add_to_quickmatch_queue(self, user_id: int, room_code: str):
        """Register a user who is waiting for an online opponent."""
        self.quickmatch_queue[user_id] = {
            "user_id": user_id,
            "room_code": room_code,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        }

    def pop_quickmatch_opponent(self, excluding_user_id: int) -> Optional[dict]:
        """Find and pop the oldest waiting player who is not the same user."""
        now = datetime.datetime.now(datetime.timezone.utc)
        # Purge entries older than 3 minutes
        stale_users = [
            uid for uid, item in self.quickmatch_queue.items()
            if (now - item["created_at"]).total_seconds() > 180
        ]
        for uid in stale_users:
            self.quickmatch_queue.pop(uid, None)

        for uid, item in list(self.quickmatch_queue.items()):
            if uid != excluding_user_id:
                return self.quickmatch_queue.pop(uid)
        return None

    def remove_from_quickmatch_queue(self, user_id: int):
        """Remove a player from the queue if they cancel."""
        self.quickmatch_queue.pop(user_id, None)

room_manager = RoomManager()
