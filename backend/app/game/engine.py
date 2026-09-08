import datetime
import random
from typing import Dict, List, Optional, Tuple
from app.game.words import validate_word
from app.game.definitions import get_word_definition


class LetterDuelGame:
    def __init__(
        self,
        room_code: str,
        player1_id: int,
        player2_id: Optional[int] = None,
        player1_username: str = "Player 1",
        player2_username: Optional[str] = None,
        player1_avatar: str = "avatar-1",
        player2_avatar: Optional[str] = None,
        allow_custom_words: bool = True,
        is_private: bool = True,
        reveal_initial_letters: bool = True
    ):
        self.room_code = room_code
        self.player1_id = player1_id
        self.player2_id = player2_id
        self.player1_username = player1_username
        self.player2_username = player2_username
        self.player1_avatar = player1_avatar
        self.player2_avatar = player2_avatar or "avatar-2"
        self.allow_custom_words = allow_custom_words
        self.is_private = is_private
        self.is_bot_opponent = False
        self.reveal_initial_letters = reveal_initial_letters

        # Game state: "WAITING", "READY", "WORD_SELECTION", "PLAYING", "GAME_OVER"
        self.state = "WAITING"
        
        # Readiness
        self.ready_players: set[int] = set()
        
        # Secret words (stored server-side ONLY)
        self.secret_words: Dict[int, str] = {}
        self.word_lengths: Dict[int, int] = {}
        # Word hints/definitions (player_id -> hint string)
        self.word_hints: Dict[int, str] = {}
        # Initial randomly revealed letters: player_id -> list of letters revealed at start
        self.initial_revealed_letters: Dict[int, List[str]] = {
            player1_id: []
        }
        if player2_id:
            self.initial_revealed_letters[player2_id] = []
        
        # Turns: player1_id or player2_id
        self.current_turn_player_id: Optional[int] = None
        self.turn_number: int = 0
        self.turn_started_at: Optional[datetime.datetime] = None
        self.turn_timeout_seconds: int = 30

        # Guesses tracking: player_id -> list of guessed letters (upper-case)
        self.guessed_letters: Dict[int, List[str]] = {
            player1_id: []
        }
        if player2_id:
            self.guessed_letters[player2_id] = []
        
        # Discovered masks for each player's view of opponent's word
        self.discovered_masks: Dict[int, List[str]] = {
            player1_id: []
        }
        if player2_id:
            self.discovered_masks[player2_id] = []

        # Full word guess tracking: player_id -> count of attempts used (max 3)
        self.word_guess_attempts: Dict[int, int] = {
            player1_id: 0
        }
        if player2_id:
            self.word_guess_attempts[player2_id] = 0
        self.max_word_guess_attempts: int = 3

        # Lifelines tracking: 3 lifelines per player (loses 1 if turn timer expires)
        self.max_lifelines: int = 3
        self.lifelines: Dict[int, int] = {
            player1_id: 3
        }
        if player2_id:
            self.lifelines[player2_id] = 3

        # Game statistics & logs
        self.history_log: List[dict] = []
        self.started_at: Optional[datetime.datetime] = None
        self.ended_at: Optional[datetime.datetime] = None
        self.winner_id: Optional[int] = None
        self.win_reason: Optional[str] = None  # "WORD_GUESSED", "ALL_LETTERS_FOUND", "FORFEIT"

        # Rematch requests: set of player IDs who voted for rematch
        self.rematch_votes: set[int] = set()

        # Rewards metadata upon game finish
        self.rewards: Optional[dict] = None

    def add_player2(self, player2_id: int, player2_username: str, player2_avatar: str = "avatar-2"):
        """Add Player 2 to the duel room."""
        self.player2_id = player2_id
        self.player2_username = player2_username
        self.player2_avatar = player2_avatar
        self.guessed_letters[player2_id] = []
        self.discovered_masks[player2_id] = []
        self.initial_revealed_letters[player2_id] = []
        self.word_guess_attempts[player2_id] = 0
        self.lifelines[player2_id] = self.max_lifelines
        if self.state == "WAITING":
            self.state = "READY"

    def get_current_player(self) -> Optional[dict]:
        """Return the player metadata whose turn is active."""
        if not self.current_turn_player_id:
            return None
        if self.current_turn_player_id == self.player1_id:
            return {"id": self.player1_id, "username": self.player1_username, "avatar": self.player1_avatar}
        return {"id": self.player2_id, "username": self.player2_username, "avatar": self.player2_avatar}

    def get_opponent(self, player_id: int) -> Optional[dict]:
        """Return opponent metadata for a given player."""
        if player_id == self.player1_id:
            if not self.player2_id:
                return None
            return {"id": self.player2_id, "username": self.player2_username, "avatar": self.player2_avatar}
        elif player_id == self.player2_id:
            return {"id": self.player1_id, "username": self.player1_username, "avatar": self.player1_avatar}
        return None

    def switch_turn(self) -> int:
        """Switch active turn strictly to the other player and stamp time."""
        if not self.player2_id:
            return self.player1_id
        next_id = self.player2_id if self.current_turn_player_id == self.player1_id else self.player1_id
        self.current_turn_player_id = next_id
        self.turn_number += 1
        self.turn_started_at = datetime.datetime.now(datetime.timezone.utc)
        return next_id

    def validate_turn(self, player_id: int) -> Tuple[bool, str]:
        """Validate if player is authorized to take action."""
        if self.state != "PLAYING":
            return False, "Game is not currently active."
        if player_id != self.current_turn_player_id:
            return False, "It is not your turn!"
        return True, ""

    def set_player_ready(self, player_id: int, ready: Optional[bool] = None) -> Tuple[bool, str]:
        """Toggle or mark player ready. When both are ready, advance to WORD_SELECTION."""
        if player_id not in (self.player1_id, self.player2_id):
            return False, "You are not a player in this room."
        
        if ready is None:
            # Toggle readiness
            if player_id in self.ready_players:
                self.ready_players.remove(player_id)
            else:
                self.ready_players.add(player_id)
        elif ready:
            self.ready_players.add(player_id)
        else:
            self.ready_players.discard(player_id)

        if self.player2_id and len(self.ready_players) == 2 and self.state in ("WAITING", "READY"):
            self.state = "WORD_SELECTION"
            return True, "Both players are ready! Select your secret words."
        
        if self.state not in ("WORD_SELECTION", "PLAYING", "GAME_OVER"):
            self.state = "READY" if self.player2_id else "WAITING"

        status_str = "ready" if player_id in self.ready_players else "not ready"
        return True, f"Player marked as {status_str}."

    def lock_word(self, player_id: int, word: str, hint: str = "") -> Tuple[bool, str]:
        """Lock in a secret word and optional hint for a player."""
        if player_id not in (self.player1_id, self.player2_id):
            return False, "Not a player in this duel."
        
        if self.state != "WORD_SELECTION":
            return False, f"Cannot lock word in state: {self.state}"
        
        if player_id in self.secret_words:
            return False, "You have already locked in your secret word."

        is_valid, clean_word, err = validate_word(word, self.allow_custom_words)
        if not is_valid:
            return False, err

        clean_word = clean_word.upper()
        self.secret_words[player_id] = clean_word
        self.word_lengths[player_id] = len(clean_word)

        # Store hint: use provided custom hint or fallback to dictionary definition
        custom_hint = hint.strip() if hint else ""
        if not custom_hint:
            custom_hint = get_word_definition(clean_word)
        self.word_hints[player_id] = custom_hint

        # If opponent is a bot and hasn't locked yet, auto-select a bot word and definition
        if self.is_bot_opponent and self.player2_id and self.player2_id not in self.secret_words:
            bot_words = ["CASTLE", "DRAGON", "GUITAR", "HORIZON", "PLANET", "SILVER", "WARRIOR", "DIAMOND"]
            bot_choice = random.choice(bot_words)
            self.secret_words[self.player2_id] = bot_choice
            self.word_lengths[self.player2_id] = len(bot_choice)
            self.word_hints[self.player2_id] = get_word_definition(bot_choice)

        # Check if both players have locked words
        if len(self.secret_words) == 2:
            self.start_game()
            return True, "Both words locked! The duel begins!"

        return True, "Secret word locked! Waiting for opponent..."

    def _apply_initial_reveals(self, guesser_id: int, target_word: str):
        """
        Reveals 1 to 3 random letters of the opponent's word at match start.
        Ensures at least 2 distinct letters remain unrevealed so the word is never pre-solved.
        """
        if not self.reveal_initial_letters or not target_word:
            return

        unique_letters = list(dict.fromkeys(target_word))
        num_unique = len(unique_letters)
        max_possible = max(0, num_unique - 2)
        if max_possible < 1:
            return

        word_len = len(target_word)
        if word_len <= 5:
            k = min(1, max_possible)
        elif 6 <= word_len <= 8:
            k = min(random.randint(1, 2), max_possible)
        else:  # 9+ letters
            k = min(random.randint(2, 3), max_possible)

        if k <= 0:
            return

        chosen_letters = random.sample(unique_letters, k)
        self.initial_revealed_letters[guesser_id] = list(chosen_letters)

        for letter in chosen_letters:
            # Uncover all occurrences in discovered mask
            for idx, ch in enumerate(target_word):
                if ch == letter:
                    self.discovered_masks[guesser_id][idx] = letter
            # Mark as guessed so it displays as hit and avoids duplicate turns
            if letter not in self.guessed_letters[guesser_id]:
                self.guessed_letters[guesser_id].append(letter)

    def start_game(self):
        """Initialize playing state, masks, and reveal initial clue letters."""
        self.state = "PLAYING"
        now = datetime.datetime.now(datetime.timezone.utc)
        self.started_at = now
        self.current_turn_player_id = self.player1_id  # Player 1 starts
        self.turn_number = 1
        self.turn_started_at = now

        # Initialize discovered masks
        # Player 1 is guessing Player 2's word
        p2_word = self.secret_words.get(self.player2_id, "")
        p2_len = self.word_lengths.get(self.player2_id, len(p2_word))
        self.discovered_masks[self.player1_id] = ["_"] * p2_len

        # Player 2 is guessing Player 1's word
        p1_word = self.secret_words.get(self.player1_id, "")
        p1_len = self.word_lengths.get(self.player1_id, len(p1_word))
        if self.player2_id:
            self.discovered_masks[self.player2_id] = ["_"] * p1_len

        # Reset lifelines for duel
        self.lifelines = {self.player1_id: self.max_lifelines}
        if self.player2_id:
            self.lifelines[self.player2_id] = self.max_lifelines

        # Reveal 1 to 3 random letters for opponent word to both players
        if p2_word:
            self._apply_initial_reveals(guesser_id=self.player1_id, target_word=p2_word)
        if self.player2_id and p1_word:
            self._apply_initial_reveals(guesser_id=self.player2_id, target_word=p1_word)

    def guess_letter(self, player_id: int, letter: str) -> Tuple[bool, dict, str]:
        """
        Processes a single letter guess.
        CRITICAL RULE: ONE GUESS per turn -> ALWAYS SWITCH TURN regardless of YES or NO.
        """
        if self.state != "PLAYING":
            return False, {}, "Game is not currently active."

        if player_id != self.current_turn_player_id:
            return False, {}, "It is not your turn!"

        letter = letter.strip().upper()
        if len(letter) != 1 or not letter.isalpha():
            return False, {}, "Guess must be a single alphabetic letter (A-Z)."

        if letter in self.guessed_letters[player_id]:
            return False, {}, f"Letter '{letter}' has already been guessed by you."

        opponent_id = self.player2_id if player_id == self.player1_id else self.player1_id
        opponent_word = self.secret_words[opponent_id]

        # Record guess
        self.guessed_letters[player_id].append(letter)

        # Check if letter is in opponent's word
        exists = letter in opponent_word
        positions_revealed: List[int] = []

        if exists:
            # Reveal all occurrences (e.g. BANANAS -> A reveals all 3)
            for idx, char in enumerate(opponent_word):
                if char == letter:
                    self.discovered_masks[player_id][idx] = letter
                    positions_revealed.append(idx)

        # Log event
        log_entry = {
            "turn": self.turn_number,
            "player_id": player_id,
            "username": self.player1_username if player_id == self.player1_id else self.player2_username,
            "type": "letter_guess",
            "letter": letter,
            "result": exists,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        self.history_log.append(log_entry)

        # Check win condition: if all blank spots are filled
        if "_" not in self.discovered_masks[player_id]:
            self.state = "GAME_OVER"
            self.ended_at = datetime.datetime.utcnow()
            self.winner_id = player_id
            self.win_reason = "ALL_LETTERS_FOUND"

            return True, {
                "letter": letter,
                "result": exists,
                "positions": positions_revealed,
                "discovered_mask": list(self.discovered_masks[player_id]),
                "game_over": True,
                "winner_id": player_id,
                "win_reason": self.win_reason,
                "next_turn_player_id": None
            }, "All letters revealed! You Win!"

        # CRITICAL RULE: Switch turn ALWAYS!
        self.current_turn_player_id = opponent_id
        self.turn_number += 1
        now = datetime.datetime.now(datetime.timezone.utc)
        self.turn_started_at = now
        expires = now + datetime.timedelta(seconds=self.turn_timeout_seconds)

        return True, {
            "letter": letter,
            "result": exists,
            "positions": positions_revealed,
            "discovered_mask": list(self.discovered_masks[player_id]),
            "game_over": False,
            "next_turn_player_id": self.current_turn_player_id,
            "turn_number": self.turn_number,
            "turn_started_at": now.isoformat(),
            "turn_expires_at": expires.isoformat(),
            "seconds_remaining": self.turn_timeout_seconds,
            "server_time": now.isoformat()
        }, f"Letter '{letter}' -> {'YES' if exists else 'NO'}. Turn passed to opponent."

    def guess_full_word(self, player_id: int, word: str) -> Tuple[bool, dict, str]:
        """
        Attempt a full-word guess.
        Max 3 attempts per player.
        If correct -> instant WIN.
        If incorrect -> Turn switches to opponent, 1 attempt deducted.
        """
        if self.state != "PLAYING":
            return False, {}, "Game is not currently active."

        if player_id != self.current_turn_player_id:
            return False, {}, "It is not your turn!"

        if self.word_guess_attempts[player_id] >= self.max_word_guess_attempts:
            return False, {}, f"Maximum full-word guess attempts ({self.max_word_guess_attempts}) reached!"

        clean_word = word.strip().upper()
        opponent_id = self.player2_id if player_id == self.player1_id else self.player1_id
        opponent_word = self.secret_words[opponent_id]

        self.word_guess_attempts[player_id] += 1
        attempts_left = self.max_word_guess_attempts - self.word_guess_attempts[player_id]

        is_correct = (clean_word == opponent_word)

        log_entry = {
            "turn": self.turn_number,
            "player_id": player_id,
            "username": self.player1_username if player_id == self.player1_id else self.player2_username,
            "type": "word_guess",
            "word": clean_word,
            "result": is_correct,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        self.history_log.append(log_entry)

        if is_correct:
            # Revealed entire word
            self.discovered_masks[player_id] = list(opponent_word)
            self.state = "GAME_OVER"
            self.ended_at = datetime.datetime.utcnow()
            self.winner_id = player_id
            self.win_reason = "WORD_GUESSED"

            return True, {
                "word": clean_word,
                "result": True,
                "attempts_left": attempts_left,
                "game_over": True,
                "winner_id": player_id,
                "win_reason": self.win_reason,
                "next_turn_player_id": None
            }, f"Correct! The word was {opponent_word}! You Win!"

        # Incorrect guess -> switch turn!
        self.current_turn_player_id = opponent_id
        self.turn_number += 1
        now = datetime.datetime.now(datetime.timezone.utc)
        self.turn_started_at = now
        expires = now + datetime.timedelta(seconds=self.turn_timeout_seconds)

        return True, {
            "word": clean_word,
            "result": False,
            "attempts_left": attempts_left,
            "game_over": False,
            "next_turn_player_id": self.current_turn_player_id,
            "turn_number": self.turn_number,
            "turn_started_at": now.isoformat(),
            "turn_expires_at": expires.isoformat(),
            "seconds_remaining": self.turn_timeout_seconds,
            "server_time": now.isoformat()
        }, f"Incorrect word '{clean_word}'! {attempts_left} full-word attempts remaining. Turn passed."

    def timeout_turn(self) -> Tuple[bool, dict, str]:
        """
        Switches turn when player fails to make a guess within 60 seconds (1 minute).
        Decrements 1 lifeline. If lifelines reach 0, player is eliminated / disqualified!
        """
        if self.state != "PLAYING" or not self.current_turn_player_id:
            return False, {}, "Game is not currently active."

        timed_out_player_id = self.current_turn_player_id
        timed_out_username = self.player1_username if timed_out_player_id == self.player1_id else self.player2_username
        next_player_id = self.player2_id if timed_out_player_id == self.player1_id else self.player1_id
        next_username = self.player1_username if next_player_id == self.player1_id else self.player2_username

        # Deduct 1 lifeline
        current_lives = self.lifelines.get(timed_out_player_id, self.max_lifelines)
        new_lives = max(0, current_lives - 1)
        self.lifelines[timed_out_player_id] = new_lives

        now = datetime.datetime.now(datetime.timezone.utc)
        self.history_log.append({
            "turn": self.turn_number,
            "player_id": timed_out_player_id,
            "username": timed_out_username,
            "type": "turn_timeout",
            "message": f"Time's up! {timed_out_username} did not guess in 30s. Lifelines left: {new_lives}/3.",
            "timestamp": now.isoformat()
        })

        if new_lives <= 0:
            # Player ran out of lifelines!
            self.state = "GAME_OVER"
            self.ended_at = now
            self.win_reason = "TIMEOUT_DISQUALIFIED"
            self.winner_id = next_player_id

            return True, {
                "timed_out_player_id": timed_out_player_id,
                "timed_out_username": timed_out_username,
                "lifelines_left": 0,
                "game_over": True,
                "winner_id": self.winner_id,
                "win_reason": f"{timed_out_username} ran out of lifelines (missed 3 turns)!",
                "turn_number": self.turn_number,
                "server_time": now.isoformat()
            }, f"⏰ {timed_out_username} ran out of lifelines (0/3 remaining)! {next_username} wins the duel!"

        # Has lifelines remaining: switch turn to opponent
        self.current_turn_player_id = next_player_id
        self.turn_number += 1
        self.turn_started_at = now

        return True, {
            "timed_out_player_id": timed_out_player_id,
            "timed_out_username": timed_out_username,
            "lifelines_left": new_lives,
            "game_over": False,
            "next_turn_player_id": next_player_id,
            "next_turn_username": next_username,
            "turn_number": self.turn_number,
            "seconds_remaining": self.turn_timeout_seconds,
            "server_time": now.isoformat(),
            "turn_deadline": (now + datetime.timedelta(seconds=self.turn_timeout_seconds)).isoformat(),
            "turn_expires_at": (now + datetime.timedelta(seconds=self.turn_timeout_seconds)).isoformat()
        }, f"Time's up! {timed_out_username} lost 1 lifeline ({new_lives}/3 remaining). Turn passed to {next_username}."

    def forfeit(self, forfeiting_player_id: int, reason: str = "FORFEIT") -> Tuple[bool, dict]:
        """Handles player surrender or 60s disconnect forfeit."""
        if self.state == "GAME_OVER":
            return False, {}

        self.state = "GAME_OVER"
        self.ended_at = datetime.datetime.utcnow()
        self.win_reason = reason
        self.winner_id = self.player2_id if forfeiting_player_id == self.player1_id else self.player1_id

        return True, {
            "game_over": True,
            "winner_id": self.winner_id,
            "win_reason": reason,
            "forfeit_player_id": forfeiting_player_id
        }

    def request_rematch(self, player_id: int) -> Tuple[bool, bool, str]:
        """
        Record rematch vote.
        Returns: (success: bool, rematch_started: bool, message: str)
        """
        if self.state != "GAME_OVER":
            return False, False, "Cannot rematch until game has finished."

        self.rematch_votes.add(player_id)
        if len(self.rematch_votes) == 2:
            # Reset for rematch
            self.reset_for_rematch()
            return True, True, "Rematch accepted by both players! Select your secret words."

        return True, False, "Rematch requested. Waiting for opponent to accept..."

    def reset_for_rematch(self):
        """Reset state for a fresh duel round."""
        self.state = "WORD_SELECTION"
        self.ready_players = {self.player1_id, self.player2_id}
        self.secret_words.clear()
        self.word_lengths.clear()
        self.word_hints.clear()
        self.initial_revealed_letters = {self.player1_id: []}
        if self.player2_id:
            self.initial_revealed_letters[self.player2_id] = []
        self.current_turn_player_id = None
        self.turn_number = 0
        self.guessed_letters = {self.player1_id: [], self.player2_id: []}
        self.discovered_masks = {self.player1_id: [], self.player2_id: []}
        self.word_guess_attempts = {self.player1_id: 0, self.player2_id: 0}
        self.lifelines = {self.player1_id: self.max_lifelines, self.player2_id: self.max_lifelines}
        self.history_log.clear()
        self.started_at = None
        self.ended_at = None
        self.winner_id = None
        self.win_reason = None
        self.rematch_votes.clear()

    def get_player_view(self, viewer_player_id: int) -> dict:
        """
        IMPORTANT SECURITY:
        Sanitizes game state so opponent's secret word is NEVER sent across wire
        until game state is GAME_OVER.
        """
        is_p1 = (viewer_player_id == self.player1_id)
        opponent_id = self.player2_id if is_p1 else self.player1_id

        # Viewer's own secret word (they know what they chose)
        my_secret_word = self.secret_words.get(viewer_player_id)
        
        # Opponent's secret word is ONLY sent when GAME_OVER
        opponent_secret_word = None
        if self.state == "GAME_OVER":
            opponent_secret_word = self.secret_words.get(opponent_id)

        # Discovered mask of opponent's word as seen by the viewer
        opponent_mask = self.discovered_masks.get(viewer_player_id, [])
        # Mask of viewer's word as discovered by opponent
        my_mask = self.discovered_masks.get(opponent_id, [])

        turn_deadline = None
        seconds_remaining = None
        now = datetime.datetime.now(datetime.timezone.utc)
        if self.state == "PLAYING" and self.turn_started_at:
            elapsed = (now - self.turn_started_at).total_seconds()
            seconds_remaining = max(0, int(round(self.turn_timeout_seconds - elapsed)))
            deadline = self.turn_started_at + datetime.timedelta(seconds=self.turn_timeout_seconds)
            turn_deadline = deadline.isoformat()

        return {
            "room_code": self.room_code,
            "is_private": getattr(self, "is_private", True),
            "state": self.state,
            "is_my_turn": (self.current_turn_player_id == viewer_player_id),
            "current_turn_player_id": self.current_turn_player_id,
            "turn_number": self.turn_number,
            "turn_started_at": self.turn_started_at.isoformat() if self.turn_started_at else None,
            "turn_deadline": turn_deadline,
            "turn_expires_at": turn_deadline,
            "turn_timeout_seconds": self.turn_timeout_seconds,
            "seconds_remaining": seconds_remaining,
            "server_time": now.isoformat(),
            "max_lifelines": self.max_lifelines,
            "player1": {
                "id": self.player1_id,
                "username": self.player1_username,
                "avatar": self.player1_avatar,
                "is_ready": self.player1_id in self.ready_players,
                "has_locked_word": self.player1_id in self.secret_words,
                "word_length": self.word_lengths.get(self.player1_id, 0),
                "word_guess_attempts_left": self.max_word_guess_attempts - self.word_guess_attempts.get(self.player1_id, 0),
                "lifelines": self.lifelines.get(self.player1_id, self.max_lifelines),
                "rematch_requested": self.player1_id in self.rematch_votes
            },
            "player2": {
                "id": self.player2_id,
                "username": self.player2_username,
                "avatar": self.player2_avatar,
                "is_ready": self.player2_id in self.ready_players,
                "has_locked_word": self.player2_id in self.secret_words,
                "word_length": self.word_lengths.get(self.player2_id, 0),
                "word_guess_attempts_left": self.max_word_guess_attempts - self.word_guess_attempts.get(self.player2_id, 0),
                "lifelines": self.lifelines.get(self.player2_id, self.max_lifelines),
                "rematch_requested": self.player2_id in self.rematch_votes
            } if self.player2_id else None,
            "my_word": my_secret_word,
            "my_word_length": self.word_lengths.get(viewer_player_id, 0),
            "my_mask": my_mask,
            "opponent_word_length": self.word_lengths.get(opponent_id, 0),
            "opponent_mask": opponent_mask,
            "opponent_hint": self.word_hints.get(opponent_id, ""),
            "my_hint": self.word_hints.get(viewer_player_id, ""),
            "initial_revealed_letters": self.initial_revealed_letters.get(viewer_player_id, []),
            "my_guessed_letters": self.guessed_letters.get(viewer_player_id, []),
            "opponent_guessed_letters": self.guessed_letters.get(opponent_id, []),
            "opponent_secret_word": opponent_secret_word,  # ONLY when GAME_OVER
            "winner_id": self.winner_id,
            "win_reason": self.win_reason,
            "rewards": self.rewards,
            "history_log": self.history_log[-30:],
            "rematch_votes": list(self.rematch_votes)
        }
