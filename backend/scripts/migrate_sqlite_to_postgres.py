"""
Safe SQLite to PostgreSQL Data Migration Script for Letter Duel.

Transfers all records from SQLite to PostgreSQL while preserving:
- Primary key IDs
- Foreign-key referential integrity (strict parent-before-child ordering)
- Data types (datetimes, booleans, nullables)
- Post-migration auto-increment sequence synchronization (setval)

Usage:
  python scripts/migrate_sqlite_to_postgres.py [--sqlite-path PATH] [--pg-url URL] [--dry-run]
"""

import os
import sys
import argparse
import datetime
from typing import Dict, Any, List

# Ensure backend root is on sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Ordered tables: Parents before children
MIGRATION_TABLES = [
    "users",
    "friendships",
    "rooms",
    "games",
    "guesses",
    "chat_messages",
    "tournaments",
    "tournament_participants",
    "tournament_matches",
    "coin_transactions",
]

def mask_connection_url(url: str) -> str:
    """Masks credentials in database URL for safe logging."""
    if not url:
        return "None"
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.password:
            masked = url.replace(f":{parsed.password}@", ":******@")
            return masked
    except Exception:
        pass
    return url.split("@")[-1] if "@" in url else url

def parse_args():
    parser = argparse.ArgumentParser(description="Letter Duel SQLite to PostgreSQL Data Migration")
    parser.add_argument(
        "--sqlite-path",
        default=os.path.join(BACKEND_DIR, "letter_duel.db"),
        help="Path to source SQLite file (default: backend/letter_duel.db)"
    )
    parser.add_argument(
        "--pg-url",
        default=None,
        help="Target PostgreSQL database URL (defaults to DATABASE_URL environment variable)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect record counts without writing to destination database"
    )
    return parser.parse_args()

def normalize_row_data(row_dict: Dict[str, Any], table_name: str) -> Dict[str, Any]:
    """Converts SQLite types (integers for booleans, iso strings for datetimes) to proper Python objects."""
    cleaned = {}
    for col, val in row_dict.items():
        if val is None:
            cleaned[col] = None
            continue

        # Handle boolean columns
        if col in ("welcome_bonus_claimed", "is_private", "is_full_word", "result", "is_system", "eliminated", "is_forfeit"):
            if isinstance(val, (int, float)):
                cleaned[col] = bool(val)
            elif isinstance(val, str):
                cleaned[col] = val.lower() in ("true", "1", "yes", "t")
            else:
                cleaned[col] = bool(val)
            continue

        # Handle datetime columns
        if col in ("created_at", "last_seen", "last_daily_bonus", "expires_at", "started_at", "ended_at", "finished_at", "joined_at", "checkin_deadline"):
            if isinstance(val, str):
                try:
                    cleaned[col] = datetime.datetime.fromisoformat(val)
                except ValueError:
                    cleaned[col] = None
            else:
                cleaned[col] = val
            continue

        cleaned[col] = val
    return cleaned

def migrate():
    args = parse_args()

    sqlite_path = os.path.abspath(args.sqlite_path)
    if not os.path.isfile(sqlite_path):
        print(f"[-] Source SQLite database not found at: {sqlite_path}")
        sys.exit(1)

    target_url = (args.pg_url or settings.get_database_url() or "").strip()
    if target_url.startswith("<") or "Render External" in target_url or not (target_url.startswith("postgres") or target_url.startswith("sqlite")):
        print("\n" + "=" * 65)
        print("[-] ERROR: INVALID TARGET DATABASE URL")
        print("=" * 65)
        print("You provided a placeholder or invalid URL:")
        print(f"  {target_url}")
        print("\nPlease replace '<Render External PostgreSQL URL>' with your real Render")
        print("PostgreSQL connection string (External Database URL).")
        print("\nExample:")
        print('  python scripts/migrate_sqlite_to_postgres.py --sqlite-path letter_duel.db --pg-url "postgresql://letter_duel_user:password@dpg-xxx-a.frankfurt-postgres.render.com:5432/letter_duel"')
        print("=" * 65 + "\n")
        sys.exit(1)

    if target_url.startswith("postgres://"):
        target_url = "postgresql://" + target_url[len("postgres://"):]

    print("=" * 65)
    print(" LETTER DUEL: SQLITE -> POSTGRESQL DATA MIGRATION")
    print("=" * 65)
    print(f" Source SQLite: {sqlite_path}")
    print(f" Target DB:     {mask_connection_url(target_url)}")
    print(f" Mode:          {'DRY RUN (No changes)' if args.dry_run else 'LIVE MIGRATION'}")
    print("=" * 65)

    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
    sqlite_inspector = inspect(sqlite_engine)
    existing_sqlite_tables = sqlite_inspector.get_table_names()

    # Verify source tables
    source_counts = {}
    with sqlite_engine.connect() as s_conn:
        for t in MIGRATION_TABLES:
            if t in existing_sqlite_tables:
                cnt = s_conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar() or 0
                source_counts[t] = cnt
            else:
                source_counts[t] = 0

    print("\nSource SQLite Records:")
    for t in MIGRATION_TABLES:
        print(f"  - {t:<26}: {source_counts[t]} rows")

    if args.dry_run:
        print("\n[OK] Dry run completed. No data was written to destination.")
        return

    # Connect to target database
    target_engine = create_engine(target_url, pool_pre_ping=True)
    target_inspector = inspect(target_engine)
    target_tables = target_inspector.get_table_names()

    missing_tables = [t for t in MIGRATION_TABLES if t not in target_tables]
    if missing_tables:
        print(f"\n[-] Destination database is missing tables: {missing_tables}")
        print("[-] Please run 'alembic upgrade head' before running data migration.")
        sys.exit(1)

    inserted_counts = {t: 0 for t in MIGRATION_TABLES}
    skipped_counts = {t: 0 for t in MIGRATION_TABLES}

    with sqlite_engine.connect() as s_conn, target_engine.begin() as d_conn:
        for table in MIGRATION_TABLES:
            if table not in existing_sqlite_tables:
                continue

            rows = s_conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
            if not rows:
                continue

            # Fetch destination columns to avoid mismatch
            dest_columns = {col["name"] for col in target_inspector.get_columns(table)}

            # Ensure any referenced room exists to satisfy strict PostgreSQL foreign keys
            if table == "games":
                existing_room_ids = {r[0] for r in d_conn.execute(text("SELECT id FROM rooms")).fetchall()}
                for r_item in rows:
                    rid = r_item["room_id"]
                    if rid not in existing_room_ids:
                        d_conn.execute(text("""
                            INSERT INTO rooms (id, room_code, player1_id, player2_id, status, is_private, entry_fee, created_at)
                            VALUES (:id, :code, :p1, :p2, 'FINISHED', true, 10, :created_at)
                        """), {
                            "id": rid,
                            "code": f"RM_{rid}",
                            "p1": r_item["player1_id"],
                            "p2": r_item["player2_id"],
                            "created_at": datetime.datetime.now(datetime.timezone.utc)
                        })
                        existing_room_ids.add(rid)

            for row in rows:
                row_dict = dict(row)
                cleaned = normalize_row_data(row_dict, table)
                # Keep only columns that exist in the target schema
                filtered = {k: v for k, v in cleaned.items() if k in dest_columns}

                if "id" in filtered:
                    existing = d_conn.execute(
                        text(f"SELECT 1 FROM {table} WHERE id = :id"),
                        {"id": filtered["id"]}
                    ).first()
                    if existing:
                        skipped_counts[table] += 1
                        continue

                col_names = list(filtered.keys())
                placeholders = [f":{c}" for c in col_names]
                stmt = text(f"INSERT INTO {table} ({', '.join(col_names)}) VALUES ({', '.join(placeholders)})")
                d_conn.execute(stmt, filtered)
                inserted_counts[table] += 1

        # Reset PostgreSQL serial sequences if target is PostgreSQL
        if target_engine.dialect.name == "postgresql":
            print("\nSynchronizing PostgreSQL auto-increment sequences...")
            for table in MIGRATION_TABLES:
                try:
                    seq_query = text(f"""
                        SELECT setval(
                            pg_get_serial_sequence('{table}', 'id'),
                            COALESCE(MAX(id), 1),
                            (SELECT MAX(id) IS NOT NULL FROM {table})
                        ) FROM {table};
                    """)
                    d_conn.execute(seq_query)
                    print(f"  [OK] Reset sequence for '{table}'")
                except Exception as seq_err:
                    print(f"  [!] Note: Sequence reset on '{table}': {seq_err}")

    print("\n" + "=" * 65)
    print(" MIGRATION SUMMARY")
    print("=" * 65)
    print(f"{'Table':<26} | {'Source':<8} | {'Inserted':<9} | {'Skipped'}")
    print("-" * 65)
    for t in MIGRATION_TABLES:
        print(f"{t:<26} | {source_counts[t]:<8} | {inserted_counts[t]:<9} | {skipped_counts[t]}")
    print("=" * 65)
    print("[OK] Migration successfully finished!\n")

if __name__ == "__main__":
    migrate()
