import pytest
from app.game.words import validate_word
from app.game.engine import LetterDuelGame

def test_word_validation():
    # Valid (between 3 and 20)
    ok, word, _ = validate_word("cat")
    assert ok is True
    assert word == "cat"

    ok, word, _ = validate_word("apple")
    assert ok is True
    assert word == "apple"

    ok, word, _ = validate_word("supercalifragilistic")
    assert ok is True
    assert word == "supercalifragilistic"

    # Too short (< 3)
    ok, _, err = validate_word("hi")
    assert ok is False
    assert "at least 3 letters" in err

    # Too long (> 20)
    ok, _, err = validate_word("supercalifragilisticx")
    assert ok is False
    assert "cannot exceed 20 letters" in err

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
        allow_custom_words=True,
        reveal_initial_letters=False
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
        player2_username="P2",
        reveal_initial_letters=False
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

def test_turn_timeout():
    game = LetterDuelGame(
        room_code="TIME01",
        player1_id=1,
        player2_id=2,
        player1_username="P1",
        player2_username="P2",
        reveal_initial_letters=False
    )
    game.set_player_ready(1)
    game.set_player_ready(2)
    game.lock_word(1, "COFFEE")
    game.lock_word(2, "ORANGE")

    assert game.state == "PLAYING"
    assert game.current_turn_player_id == 1
    assert game.turn_number == 1

    # Lifelines start at 3
    assert game.lifelines[1] == 3
    assert game.lifelines[2] == 3

    # Simulate 60-second timeout on Player 1 -> loses 1 lifeline (2 left)
    ok, data, msg = game.timeout_turn()
    assert ok is True
    assert data["timed_out_player_id"] == 1
    assert data["lifelines_left"] == 2
    assert data["game_over"] is False
    assert game.lifelines[1] == 2
    assert data["next_turn_player_id"] == 2
    assert game.current_turn_player_id == 2  # TURN SWITCHED TO PLAYER 2!
    assert game.turn_number == 2

    # Simulate 60-second timeout on Player 2 -> loses 1 lifeline (2 left)
    ok, data, msg = game.timeout_turn()
    assert ok is True
    assert data["timed_out_player_id"] == 2
    assert data["lifelines_left"] == 2
    assert data["game_over"] is False
    assert game.lifelines[2] == 2
    assert data["next_turn_player_id"] == 1
    assert game.current_turn_player_id == 1  # TURN SWITCHED TO PLAYER 1!
    assert game.turn_number == 3

    # Player 1 times out second time -> 1 lifeline left
    ok, data, msg = game.timeout_turn()
    assert ok is True
    assert data["lifelines_left"] == 1
    assert game.lifelines[1] == 1
    assert game.current_turn_player_id == 2

    # Player 2 makes a valid move
    game.guess_letter(2, "C")
    assert game.current_turn_player_id == 1

    # Player 1 times out third time -> 0 lifelines left -> ELIMINATED!
    ok, data, msg = game.timeout_turn()
    assert ok is True
    assert data["lifelines_left"] == 0
    assert data["game_over"] is True
    assert data["winner_id"] == 2
    assert game.state == "GAME_OVER"
    assert game.winner_id == 2
    assert game.win_reason == "TIMEOUT_DISQUALIFIED"

def test_random_initial_reveals_and_hints():
    """Verify that when words are locked with default settings, 1-3 random letters are revealed."""
    game = LetterDuelGame(
        room_code="HINT01",
        player1_id=10,
        player2_id=20,
        player1_username="Alice",
        player2_username="Bob",
        allow_custom_words=True
    )
    game.set_player_ready(10)
    game.set_player_ready(20)

    # Player 1 locks TRANQUILITY (11 letters) with auto-definition
    # Player 2 locks PEACE (5 letters) with custom clue "Inner calm and harmony"
    ok1, _ = game.lock_word(10, "TRANQUILITY")
    ok2, _ = game.lock_word(20, "PEACE", hint="Inner calm and harmony")
    assert ok1 and ok2
    assert game.state == "PLAYING"

    # Check views
    p1_view = game.get_player_view(10)  # Alice guessing Bob's "PEACE"
    p2_view = game.get_player_view(20)  # Bob guessing Alice's "TRANQUILITY"

    # Bob's word is PEACE (5 letters) -> Alice should get 1 revealed letter
    p1_revealed = p1_view["initial_revealed_letters"]
    assert len(p1_revealed) == 1
    assert p1_revealed[0] in "PEACE"
    # Mask should have that letter uncovered
    assert p1_view["opponent_mask"].count("_") < 5
    # Alice should see Bob's custom clue
    assert p1_view["opponent_hint"] == "Inner calm and harmony"

    # Alice's word is TRANQUILITY (11 letters) -> Bob should get 2 or 3 revealed letters
    p2_revealed = p2_view["initial_revealed_letters"]
    assert len(p2_revealed) in (2, 3)
    for ch in p2_revealed:
        assert ch in "TRANQUILITY"
        # Must be in opponent's mask
        assert ch in p2_view["opponent_mask"]
        # Must be in guessed_letters
        assert ch in p2_view["my_guessed_letters"]
    # At least 2 distinct letters must remain hidden
    hidden_count = p2_view["opponent_mask"].count("_")
    assert hidden_count >= 2
    # Bob should see the auto definition for TRANQUILITY
    assert "peace" in p2_view["opponent_hint"].lower() or "calm" in p2_view["opponent_hint"].lower()

    # Bob attempts to guess a letter that was already initially revealed -> must fail
    already_revealed = p2_revealed[0]
    # If it's not Bob's turn, Alice takes a turn first
    if game.current_turn_player_id == 10:
        # Alice guesses a letter
        game.guess_letter(10, "Z")  # switches turn to Bob
    ok_dup, _, err = game.guess_letter(20, already_revealed)
    assert ok_dup is False
    assert "already been guessed" in err
