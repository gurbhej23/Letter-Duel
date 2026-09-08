import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "letter_duel.db")

def wipe_all_data():
    """Wipes all players, rooms, games, tournaments, and transactions for a 100% fresh start."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        tables = [
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
        print("\n" + "=" * 50)
        print(" WIPING ALL DATABASE RECORDS")
        print("=" * 50)
        for t in tables:
            try:
                cur.execute(f"DELETE FROM {t}")
                print(f" Cleared table: {t} ({cur.rowcount} rows deleted)")
            except sqlite3.OperationalError:
                pass
        
        # Reset SQLite auto-increment IDs
        try:
            cur.execute("DELETE FROM sqlite_sequence")
        except sqlite3.OperationalError:
            pass

        conn.commit()
        print("=" * 50)
        print(" DATABASE IS NOW 100% CLEAN & FRESH!")
        print("=" * 50 + "\n")
    finally:
        conn.close()

def wipe_test_users_only():
    """Deletes test and bot users generated during testing, keeping real player accounts."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        print("\n" + "=" * 50)
        print(" CLEANING ONLY TEST & AUTOMATED USERS")
        print("=" * 50)
        cur.execute("""
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
               OR email LIKE '%@test.com'
               OR email LIKE '%@letterduel.gg'
        """)
        print(f" Deleted {cur.rowcount} test accounts.")
        
        # Clear abandoned/test rooms
        cur.execute("DELETE FROM rooms WHERE status IN ('ABANDONED', 'GAME_OVER')")
        print(f" Cleaned {cur.rowcount} inactive/abandoned rooms.")
        
        conn.commit()
        print("=" * 50 + "\n")
    finally:
        conn.close()

def delete_user_by_name(username: str):
    """Deletes a specific user by username."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
        if cur.rowcount > 0:
            print(f" User '{username}' successfully deleted.")
        else:
            print(f" User '{username}' not found.")
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg == "all":
            wipe_all_data()
        elif arg == "tests":
            wipe_test_users_only()
        elif arg.startswith("user="):
            delete_user_by_name(arg.split("=", 1)[1])
        else:
            print("Usage:")
            print("  python clean_db.py all         -> Wipe everything (100% fresh start)")
            print("  python clean_db.py tests       -> Remove only automated test users")
            print("  python clean_db.py user=<name> -> Delete a specific player by username")
    else:
        print("Usage:")
        print("  python clean_db.py all         -> Wipe everything (100% fresh start)")
        print("  python clean_db.py tests       -> Remove only automated test users")
        print("  python clean_db.py user=<name> -> Delete a specific player by username")
