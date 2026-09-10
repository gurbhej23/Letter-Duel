"""
Letter Duel — Database Cleanup & Reset CLI Tool

Supports clearing/wiping data from:
1. Local SQLite database
2. Remote Render PostgreSQL database
3. Both databases at the same time

Usage:
  # 1. Clean ONLY automated test bots (keeps real players like 'saajan' and 'gurbhej'):
  python clean_db.py tests
  python clean_db.py tests --pg "postgresql://..."
  python clean_db.py tests --both --pg "postgresql://..."

  # 2. Complete fresh start (wipes all players, matches, rooms, history, and coins):
  python clean_db.py all
  python clean_db.py all --pg "postgresql://..."
  python clean_db.py all --both --pg "postgresql://..."

  # 3. Delete a specific player by username:
  python clean_db.py user=saajan
  python clean_db.py user=saajan --pg "postgresql://..."
"""

import os
import sys
import argparse
from sqlalchemy import create_engine, text
from app.config import settings

TABLES_IN_ORDER = [
    "coin_transactions",
    "guesses",
    "chat_messages",
    "tournament_matches",
    "tournament_participants",
    "tournaments",
    "games",
    "rooms",
    "friendships",
    "users"
]

def parse_args():
    parser = argparse.ArgumentParser(description="Letter Duel Database Cleanup Tool")
    parser.add_argument(
        "action",
        nargs="?",
        default="help",
        help="Action to perform: 'all' (100% fresh start), 'tests' (clean automated bots only), or 'user=<name>'"
    )
    parser.add_argument(
        "--pg",
        "--url",
        default=None,
        dest="pg_url",
        help="Target PostgreSQL database URL (if targeting Render PostgreSQL)"
    )
    parser.add_argument(
        "--both",
        action="store_true",
        help="Execute the cleanup action on BOTH local SQLite and Render PostgreSQL"
    )
    return parser.parse_args()

def wipe_target(engine, label: str):
    print(f"\n[+] Wiping all records from {label}...")
    with engine.begin() as conn:
        for t in TABLES_IN_ORDER:
            try:
                res = conn.execute(text(f"DELETE FROM {t}"))
                print(f"    Cleared table: {t:<26} ({res.rowcount} rows deleted)")
            except Exception as e:
                print(f"    Note on {t}: {e}")

        # Reset sequences
        if engine.dialect.name == "sqlite":
            try:
                conn.execute(text("DELETE FROM sqlite_sequence"))
                print("    Reset SQLite auto-increment counter.")
            except Exception:
                pass
        elif engine.dialect.name == "postgresql":
            for t in TABLES_IN_ORDER:
                try:
                    conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), 1, false)"))
                except Exception:
                    pass
            print("    Reset PostgreSQL sequences.")

        # Recreate system bot user
        try:
            conn.execute(text("""
                INSERT INTO users (id, username, email, password_hash, avatar, coins, rating, rank, welcome_bonus_claimed)
                VALUES (99999, 'BOT', 'bot@letterduel.internal', 'system_bot_disabled_login', 'avatar-robot', 10000, 800, 'Bronze III', true)
                ON CONFLICT (id) DO NOTHING
            """))
            print("    Re-initialized default BOT user (id=99999).")
        except Exception as e:
            print(f"    Note creating bot: {e}")

    print(f"[OK] {label} is now 100% clean & fresh!\n")

def clean_test_users(engine, label: str):
    print(f"\n[+] Cleaning automated test accounts from {label}...")
    with engine.begin() as conn:
        # 1. Clean test rooms & matches
        conn.execute(text("DELETE FROM rooms WHERE status IN ('ABANDONED', 'GAME_OVER')"))

        # 2. Delete test users
        res = conn.execute(text("""
            DELETE FROM users 
            WHERE username LIKE 'TestPlayer%'
               OR username LIKE 'coin_duelist%'
               OR username LIKE 'daily_user%'
               OR username LIKE 'E2EPlayer%'
               OR username LIKE 'bronze_duelist%'
               OR username LIKE 'poor_master%'
               OR username LIKE 'host_silver%'
               OR username LIKE 'guest_%'
               OR username LIKE 'user_tier_%'
               OR username LIKE 'winner_settle%'
               OR username LIKE 'loser_settle%'
               OR username LIKE 'TourneyUser%'
               OR username LIKE 'FlowUser%'
               OR username LIKE 'ForfeitUser%'
               OR username LIKE '%_178%'
               OR email LIKE '%@test.com'
               OR email LIKE '%@letterduel.gg'
        """))
        print(f"    Removed {res.rowcount} automated test accounts.")
    print(f"[OK] {label} cleaned! Real player accounts remain intact.\n")

def delete_single_user(engine, label: str, username: str):
    print(f"\n[+] Deleting user '{username}' and related records from {label}...")
    with engine.begin() as conn:
        u = conn.execute(text("SELECT id FROM users WHERE LOWER(username) = LOWER(:u)"), {"u": username}).first()
        if not u:
            print(f"[!] User '{username}' was not found in {label}.")
            return
        uid = u[0]
        # Delete dependent child rows first to satisfy foreign keys
        conn.execute(text("DELETE FROM coin_transactions WHERE user_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM guesses WHERE player_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM chat_messages WHERE sender_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM games WHERE player1_id = :uid OR player2_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM rooms WHERE player1_id = :uid OR player2_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM tournament_matches WHERE player1_id = :uid OR player2_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM tournament_participants WHERE user_id = :uid"), {"uid": uid})
        conn.execute(text("DELETE FROM friendships WHERE requester_id = :uid OR receiver_id = :uid"), {"uid": uid})
        res = conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})
        if res.rowcount > 0:
            print(f"[OK] User '{username}' (ID {uid}) and all associated match data deleted from {label}.")

def main():
    args = parse_args()
    action = args.action.lower()

    if action == "help" or (action not in ("all", "tests") and not action.startswith("user=")):
        print("\n" + "=" * 65)
        print(" LETTER DUEL: DATABASE CLEANUP TOOL")
        print("=" * 65)
        print("Usage:")
        print("  python clean_db.py tests                   -> Remove only test bots from local SQLite")
        print("  python clean_db.py tests --pg \"<URL>\"       -> Remove only test bots from Render PG")
        print("  python clean_db.py tests --both --pg \"<URL>\"-> Remove test bots from BOTH databases")
        print("")
        print("  python clean_db.py all                     -> 100% fresh start for local SQLite")
        print("  python clean_db.py all --pg \"<URL>\"         -> 100% fresh start for Render PG")
        print("  python clean_db.py all --both --pg \"<URL>\"  -> 100% fresh start for BOTH databases")
        print("")
        print("  python clean_db.py user=saajan             -> Delete specific user by name")
        print("=" * 65 + "\n")
        return

    # Build engine targets
    sqlite_path = os.path.join(os.path.dirname(__file__), "letter_duel.db")
    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})

    pg_url = args.pg_url
    if pg_url and pg_url.startswith("postgres://"):
        pg_url = "postgresql://" + pg_url[len("postgres://"):]
    pg_engine = create_engine(pg_url, pool_pre_ping=True) if pg_url else None

    # Determine targets
    targets = []
    if args.both:
        if not pg_engine:
            print("[-] Error: To use --both, you must provide --pg \"<PostgreSQL URL>\"")
            sys.exit(1)
        targets = [(sqlite_engine, "SQLite (Local)"), (pg_engine, "PostgreSQL (Render)")]
    elif pg_engine:
        targets = [(pg_engine, "PostgreSQL (Render)")]
    else:
        targets = [(sqlite_engine, "SQLite (Local)")]

    print("=" * 65)
    print(" LETTER DUEL DATABASE CLEANUP")
    print("=" * 65)
    print(f" Action:  {action}")
    print(f" Targets: {', '.join(label for _, label in targets)}")
    print("=" * 65)

    for eng, label in targets:
        if action == "all":
            wipe_target(eng, label)
        elif action == "tests":
            clean_test_users(eng, label)
        elif action.startswith("user="):
            username = action.split("=", 1)[1]
            delete_single_user(eng, label, username)

if __name__ == "__main__":
    main()
