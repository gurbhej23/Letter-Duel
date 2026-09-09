"""
Safe Database Record Count Verification Script for Letter Duel.

Compares table record counts between the source SQLite database and target database.
Does NOT output any passwords, credentials, JWTs, or sensitive user data.

Usage:
  python scripts/verify_db_counts.py [--sqlite-path PATH] [--target-url URL]
"""

import os
import sys
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import create_engine, text, inspect
from app.config import settings

TABLES_TO_VERIFY = [
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

def mask_url(url: str) -> str:
    if not url:
        return "None"
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        if p.password:
            return url.replace(f":{p.password}@", ":******@")
    except Exception:
        pass
    return url.split("@")[-1] if "@" in url else url

def parse_args():
    parser = argparse.ArgumentParser(description="Verify table counts between SQLite and target database")
    parser.add_argument(
        "--sqlite-path",
        default=os.path.join(BACKEND_DIR, "letter_duel.db"),
        help="Path to SQLite database file"
    )
    parser.add_argument(
        "--target-url",
        default=None,
        help="Target database URL (defaults to DATABASE_URL environment variable)"
    )
    return parser.parse_args()

def verify():
    args = parse_args()
    sqlite_path = os.path.abspath(args.sqlite_path)

    if not os.path.isfile(sqlite_path):
        print(f"[-] SQLite file not found: {sqlite_path}")
        sys.exit(1)

    target_url = (args.target_url or settings.get_database_url() or "").strip()
    if target_url.startswith("<") or "Render External" in target_url or not (target_url.startswith("postgres") or target_url.startswith("sqlite")):
        print("\n" + "=" * 68)
        print("[-] ERROR: INVALID TARGET DATABASE URL")
        print("=" * 68)
        print("You provided a placeholder or invalid URL:")
        print(f"  {target_url}")
        print("\nPlease replace '<Render External PostgreSQL URL>' with your real Render")
        print("PostgreSQL connection string (External Database URL).")
        print("\nExample:")
        print('  python scripts/verify_db_counts.py --sqlite-path letter_duel.db --target-url "postgresql://letter_duel_user:password@dpg-xxx-a.frankfurt-postgres.render.com:5432/letter_duel"')
        print("=" * 68 + "\n")
        sys.exit(1)

    if target_url.startswith("postgres://"):
        target_url = "postgresql://" + target_url[len("postgres://"):]

    print("=" * 68)
    print(" LETTER DUEL: DATABASE RECORD VERIFICATION REPORT")
    print("=" * 68)
    print(f" Source SQLite: {sqlite_path}")
    print(f" Target DB:     {mask_url(target_url)}")
    print("=" * 68)

    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
    target_engine = create_engine(target_url, pool_pre_ping=True)

    sqlite_insp = inspect(sqlite_engine)
    target_insp = inspect(target_engine)

    sqlite_tables = set(sqlite_insp.get_table_names())
    target_tables = set(target_insp.get_table_names())

    print(f"\n{'Table Name':<28} | {'SQLite Rows':<12} | {'Target Rows':<12} | {'Status'}")
    print("-" * 68)

    all_matched = True

    with sqlite_engine.connect() as s_conn, target_engine.connect() as t_conn:
        for t in TABLES_TO_VERIFY:
            s_count = 0
            t_count = 0

            if t in sqlite_tables:
                s_count = s_conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar() or 0
            else:
                s_count = "N/A"

            if t in target_tables:
                t_count = t_conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar() or 0
            else:
                t_count = "MISSING"

            if s_count == t_count:
                status = "MATCH [OK]"
            else:
                status = f"DIFF (DELTA {t_count - s_count if isinstance(s_count, int) and isinstance(t_count, int) else '?'})"
                all_matched = False

            print(f"{t:<28} | {str(s_count):<12} | {str(t_count):<12} | {status}")

    print("=" * 68)
    if all_matched:
        print("[OK] All table row counts match perfectly between databases!\n")
    else:
        print("[!] Note: Discrepancies found. Review differences above.\n")

if __name__ == "__main__":
    verify()
