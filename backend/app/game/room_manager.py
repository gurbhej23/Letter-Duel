import asyncio
import datetime
import random
import string
import logging
from typing import Dict, Optional, Set
from fastapi import WebSocket
from app.game.engine import LetterDuelGame
from app.config import settings

logger = logging.getLogger(__name__)

def generate_room_code(length: int = 6) -> str:
    """Generate a random, non-sequential, secure 6-character room code."""
    # Exclude ambiguous characters like 0, O, 1, I
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(random.choice(chars) for _ in range(length))

ARENA_TIERS: Dict[int, dict] = {
    10: {"min_rank": "Bronze III", "min_level": 1, "name": "Rookie Duel", "pot": 20, "badge": "🥉"},
    25: {"min_rank": "Bronze II", "min_level": 1, "name": "Apprentice Duel", "pot": 50, "badge": "🥈"},
    50: {"min_rank": "Silver III", "min_level": 1, "name": "Warrior Duel", "pot": 100, "badge": "🥇"},
    100: {"min_rank": "Gold III", "min_level": 1, "name": "Master Duel", "pot": 200, "badge": "💎"},
    250: {"min_rank": "Platinum III", "min_level": 1, "name": "Champion Duel", "pot": 500, "badge": "👑"}
}

class RoomSession:
    def __init__(self, room_code: str, allow_custom_words: bool = True, is_private: bool = True, entry_fee: int = 10):
        self.room_code = room_code
        self.allow_custom_words = allow_custom_words
        self.is_private = is_private
        self.entry_fee = entry_fee
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
        # Quickmatch queue: user_id -> {"user_id": user_id, "username": str, "avatar": str, "room_code": room_code, "entry_fee": int, "created_at": datetime, "status": str}
        self.quickmatch_queue: Dict[int, dict] = {}
        self._lock = asyncio.Lock()

    def create_room(self, allow_custom_words: bool = True, is_private: bool = True, entry_fee: int = 50) -> str:
        code = generate_room_code()
        while code in self.rooms:
            code = generate_room_code()
        self.rooms[code] = RoomSession(room_code=code, allow_custom_words=allow_custom_words, is_private=is_private, entry_fee=entry_fee)
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

    async def add_to_quickmatch_queue(self, user_id: int, username: str, avatar: str, room_code: str, entry_fee: int = 10, rating: int = 800):
        """Register a user who is actively waiting for an online opponent at a specific entry stake."""
        async with self._lock:
            self.quickmatch_queue[user_id] = {
                "user_id": user_id,
                "username": username,
                "avatar": avatar,
                "room_code": room_code,
                "entry_fee": entry_fee,
                "rating": rating,
                "created_at": datetime.datetime.now(datetime.timezone.utc),
                "status": "LOOKING_FOR_MATCH"
            }
            logger.info(f"[Matchmaking] Player {username} (id: {user_id}, rating: {rating}) joined queue for {entry_fee} coins in room {room_code}. Queue size: {len(self.quickmatch_queue)}")

    async def pop_quickmatch_opponent(self, excluding_user_id: int, entry_fee: int = 10, user_rating: int = 800) -> Optional[dict]:
        """
        Atomically find and pop the best waiting REAL online player in the same entry stake tier,
        prioritizing closest hidden rating (MMR).
        Strict requirements:
        1. Must NOT be the current user.
        2. Must match the requested entry_fee tier.
        3. Must be actively connected / verified online in presence_manager.
        4. Must NOT already be in an active playing duel.
        5. Room must still exist in memory and be open.
        """
        from app.game.presence import presence_manager

        async with self._lock:
            now = datetime.datetime.now(datetime.timezone.utc)
            # Purge stale entries (> 90 seconds or closed rooms)
            stale_uids = []
            for uid, item in list(self.quickmatch_queue.items()):
                age = (now - item["created_at"]).total_seconds()
                room = self.get_room(item["room_code"])
                # Discard if older than 90s, or room doesn't exist, or user is offline
                if age > 90 or not room or not presence_manager.is_user_online(uid):
                    stale_uids.append(uid)

            for uid in stale_uids:
                logger.info(f"[Matchmaking] Purged stale/offline queue entry for user {uid}")
                self.quickmatch_queue.pop(uid, None)

            # Find valid candidates matching the requested entry_fee
            candidates = []
            for uid, item in list(self.quickmatch_queue.items()):
                if uid == excluding_user_id:
                    continue

                if item.get("entry_fee", 10) != entry_fee:
                    continue

                # Ensure candidate is not currently in an active PLAYING match
                candidate_room = self.get_room(item["room_code"])
                if not candidate_room:
                    continue
                if candidate_room.game and candidate_room.game.state in ("PLAYING", "WORD_SELECTION"):
                    continue

                diff = abs(item.get("rating", 800) - user_rating)
                candidates.append((diff, uid))

            if candidates:
                # Sort by rating proximity (closest rating first)
                candidates.sort(key=lambda x: x[0])
                best_uid = candidates[0][1]
                popped = self.quickmatch_queue.pop(best_uid)
                logger.info(f"[Matchmaking] Matched candidate {popped['username']} (id: {best_uid}, rating: {popped.get('rating', 800)}) at {entry_fee} coins with challenger {excluding_user_id} (rating: {user_rating})")
                return popped

            return None

    async def remove_from_quickmatch_queue(self, user_id: int):
        """Remove a player from the queue if they cancel or disconnect."""
        async with self._lock:
            removed = self.quickmatch_queue.pop(user_id, None)
            if removed:
                logger.info(f"[Matchmaking] Removed user {user_id} from queue.")

    def get_queue_count(self) -> int:
        """Return count of users actively searching for match."""
        return len(self.quickmatch_queue)

    def is_user_in_queue(self, user_id: int) -> bool:
        return user_id in self.quickmatch_queue

room_manager = RoomManager()
