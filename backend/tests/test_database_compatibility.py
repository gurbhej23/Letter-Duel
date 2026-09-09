import pytest
from sqlalchemy import create_engine, inspect
from app.config import Settings
from app.database import Base
from app.models import (
    User, Room, Game, Guess, ChatMessage, Friendship,
    Tournament, TournamentParticipant, TournamentMatch, CoinTransaction
)

def test_database_url_normalization():
    """Verify postgres:// is correctly normalized to postgresql:// without losing query params or credentials."""
    s1 = Settings(DATABASE_URL="postgres://render_user:secret_pass@dpg-abc-123.render.com:5432/letterduel_db")
    assert s1.get_database_url().startswith("postgresql://render_user:secret_pass@dpg-abc-123.render.com:5432/letterduel_db")

    s2 = Settings(DATABASE_URL="sqlite:///./test.db")
    assert s2.get_database_url() == "sqlite:///./test.db"

    s3 = Settings(DATABASE_URL="postgresql+psycopg://user:pass@localhost/db")
    assert s3.get_database_url() == "postgresql+psycopg://user:pass@localhost/db"

def test_all_ten_models_registered_in_metadata():
    """Ensure all 10 required database models exist in Base.metadata with primary keys and relationships."""
    expected_tables = {
        "users",
        "friendships",
        "rooms",
        "games",
        "guesses",
        "chat_messages",
        "tournaments",
        "tournament_participants",
        "tournament_matches",
        "coin_transactions"
    }
    actual_tables = set(Base.metadata.tables.keys())
    assert expected_tables.issubset(actual_tables), f"Missing tables: {expected_tables - actual_tables}"

    # Verify key columns on User
    user_cols = {c.name for c in Base.metadata.tables["users"].columns}
    assert {"id", "username", "email", "password_hash", "coins", "rating", "rank"}.issubset(user_cols)

    # Verify key columns on Room
    room_cols = {c.name for c in Base.metadata.tables["rooms"].columns}
    assert {"id", "room_code", "player1_id", "player2_id", "entry_fee", "status"}.issubset(room_cols)

    # Verify key columns on CoinTransaction
    tx_cols = {c.name for c in Base.metadata.tables["coin_transactions"].columns}
    assert {"id", "user_id", "amount", "balance_after", "transaction_type"}.issubset(tx_cols)

def test_alembic_migration_creates_identical_schema(tmp_path):
    """Test creating an empty database, applying alembic migration, and validating all tables exist."""
    from alembic import command
    from alembic.config import Config
    import os

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_ini = os.path.join(backend_dir, "alembic.ini")
    db_file = tmp_path / "migration_test.db"
    test_db_url = f"sqlite:///{db_file}"

    alembic_cfg = Config(alembic_ini)
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)

    # Apply migrations
    os.environ["DATABASE_URL"] = test_db_url
    try:
        command.upgrade(alembic_cfg, "head")

        test_engine = create_engine(test_db_url)
        inspector = inspect(test_engine)
        tables = set(inspector.get_table_names())

        expected = {
            "users", "friendships", "rooms", "games", "guesses",
            "chat_messages", "tournaments", "tournament_participants",
            "tournament_matches", "coin_transactions"
        }
        assert expected.issubset(tables)
    finally:
        # Restore default
        os.environ["DATABASE_URL"] = "sqlite:///./letter_duel.db"
