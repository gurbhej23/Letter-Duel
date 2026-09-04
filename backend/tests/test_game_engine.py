import pytest
from app.game.words import validate_word
from app.game.engine import LetterDuelGame

def test_word_validation():
    # Valid
    ok, word, _ = validate_word("apple")
    assert ok is True
    assert word == "apple"

    # Too short (< 5)
    ok, _, err = validate_word("cat")
    assert ok is False
    assert "at least 5 letters" in err

    # Too long (> 15)
    ok, _, err = validate_word("supercalifragilistic")
    assert ok is False
    assert "cannot exceed 15 letters" in err

    # Non-alpha
    ok, _, err = validate_word("duel123")
    assert ok is False
    assert "only alphabetic letters" in err

    ok, _, err = validate_word("hello world")
    assert ok is False

def test_game_engine_turn_switching_and_rules():
    # Setup game
    game = LetterDuelGame(
        room_code="A7K92P",
        player1_id=1,
        player2_id=2,
        player1_username="Alex",
        player2_username="John",
        allow_custom_words=True
    )

    # Readiness
    assert game.state == "WAITING"
    game.set_player_ready(1)
    assert game.state == "READY"
    game.set_player_ready(2)
    assert game.state == "WORD_SELECTION"

    # Word selection
    # Player 1 chooses "BANANAS" (7 letters)
    # Player 2 chooses "APPLE" (5 letters)
    ok, msg = game.lock_word(1, "BANANAS")
    assert ok is True
    assert game.state == "WORD_SELECTION"

    ok, msg = game.lock_word(2, "APPLE")
    assert ok is True
    assert game.state == "PLAYING"
    assert game.current_turn_player_id == 1  # Player 1 goes first

    # Word privacy check
    p1_view = game.get_player_view(1)
    p2_view = game.get_player_view(2)
    assert p1_view["my_word"] == "BANANAS"
    assert p1_view["opponent_secret_word"] is None  # Opponent word is hidden!
    assert p1_view["opponent_word_length"] == 5
    assert p1_view["opponent_mask"] == ["_", "_", "_", "_", "_"]

    assert p2_view["my_word"] == "APPLE"
    assert p2_view["opponent_secret_word"] is None  # Opponent word is hidden!
    assert p2_view["opponent_word_length"] == 7
    assert p2_view["opponent_mask"] == ["_", "_", "_", "_", "_", "_", "_"]

    # --- TURN 1: Player 1 guesses 'A' on John's word ("APPLE") ---
    # John's word has 'A'. Result: YES.
    # CRITICAL RULE: Turn MUST switch to Player 2!
    ok, data, msg = game.guess_letter(1, "A")
    assert ok is True
    assert data["result"] is True  # YES
    assert data["positions"] == [0]  # First letter of APPLE
    assert data["discovered_mask"] == ["A", "_", "_", "_", "_"]
    assert game.current_turn_player_id == 2  # TURN SWITCHED TO PLAYER 2!
    assert data["game_over"] is False

    # Attempting to guess again with Player 1 must FAIL
    ok, data, err = game.guess_letter(1, "E")
    assert ok is False
    assert "not your turn" in err.lower()

    # --- TURN 2: Player 2 guesses 'B' on Alex's word ("BANANAS") ---
    # Alex's word has 'B'. Result: YES.
    # Turn MUST switch to Player 1!
    ok, data, msg = game.guess_letter(2, "B")
    assert ok is True
    assert data["result"] is True
    assert data["positions"] == [0]
    assert data["discovered_mask"] == ["B", "_", "_", "_", "_", "_", "_"]
    assert game.current_turn_player_id == 1  # TURN SWITCHED TO PLAYER 1!

    # --- TURN 3: Player 1 guesses 'Z' on John's word ("APPLE") ---
    # Result: NO (miss).
    # Turn MUST switch to Player 2!
    ok, data, msg = game.guess_letter(1, "Z")
    assert ok is True
    assert data["result"] is False  # NO
    assert data["discovered_mask"] == ["A", "_", "_", "_", "_"]  # Unchanged
    assert game.current_turn_player_id == 2  # TURN SWITCHED TO PLAYER 2!

    # Cannot guess already guessed letter
    ok, data, err = game.guess_letter(2, "B")
    assert ok is False
    assert "already been guessed" in err.lower()

    # --- TURN 4: Repeated letter test: Player 2 guesses 'A' on "BANANAS" ---
    # "BANANAS" has 3 'A's at indices 1, 3, 5.
    ok, data, msg = game.guess_letter(2, "A")
    assert ok is True
    assert data["result"] is True
    assert data["positions"] == [1, 3, 5]
    assert data["discovered_mask"] == ["B", "A", "_", "A", "_", "A", "_"]
    assert game.current_turn_player_id == 1  # TURN SWITCHED TO PLAYER 1!

    # --- Full Word Guess: Incorrect guess ---
    # Player 1 guesses "ZEBRA" instead of "APPLE"
    ok, data, msg = game.guess_full_word(1, "ZEBRA")
    assert ok is True
    assert data["result"] is False
    assert data["attempts_left"] == 2
    assert game.current_turn_player_id == 2  # TURN SWITCHED TO PLAYER 2!

    # --- Full Word Guess: Correct guess -> Instant WIN ---
    # Player 2 guesses "BANANAS"
    ok, data, msg = game.guess_full_word(2, "BANANAS")
    assert ok is True
    assert data["result"] is True
    assert data["game_over"] is True
    assert game.winner_id == 2
    assert game.win_reason == "WORD_GUESSED"

    # In GAME_OVER view, secret words are now revealed to both
    p1_end_view = game.get_player_view(1)
    p2_end_view = game.get_player_view(2)
    assert p1_end_view["opponent_secret_word"] == "APPLE"
    assert p2_end_view["opponent_secret_word"] == "BANANAS"

def test_all_letters_discovered_win():
    game = LetterDuelGame(
        room_code="TEST99",
        player1_id=1,
        player2_id=2,
        player1_username="P1",
        player2_username="P2"
    )
    game.set_player_ready(1)
    game.set_player_ready(2)
    game.lock_word(1, "GHOST")
    game.lock_word(2, "PIANO")

    # Sequence of guesses to fill PIANO: P, I, A, N, O
    # P1 guesses P
    game.guess_letter(1, "P")
    # P2 guesses Z (miss)
    game.guess_letter(2, "Z")
    # P1 guesses I
    game.guess_letter(1, "I")
    # P2 guesses X (miss)
    game.guess_letter(2, "X")
    # P1 guesses A
    game.guess_letter(1, "A")
    # P2 guesses Q (miss)
    game.guess_letter(2, "Q")
    # P1 guesses N
    game.guess_letter(1, "N")
    # P2 guesses Y (miss)
    game.guess_letter(2, "Y")
    # P1 guesses O -> completes PIANO!
    ok, data, msg = game.guess_letter(1, "O")
    assert ok is True
    assert data["game_over"] is True
    assert game.winner_id == 1
    assert game.win_reason == "ALL_LETTERS_FOUND"
