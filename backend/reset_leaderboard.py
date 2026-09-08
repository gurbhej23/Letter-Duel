import sqlite3

db_paths = ['backend/letter_duel.db', 'letter_duel.db']

for db_path in db_paths:
    print(f"--- Processing {db_path} ---")
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        # 1. Delete bot & test accounts
        cur.execute("DELETE FROM users WHERE email LIKE '%@letterduel.gg' OR email LIKE '%@test.com'")
        print(f"Deleted {cur.rowcount} test/bot accounts.")
        
        # 2. Reset real users stats to 0
        cur.execute("""
            UPDATE users
            SET wins = 0,
                losses = 0,
                xp = 0,
                current_streak = 0,
                best_streak = 0,
                level = 1,
                coins = 500
        """)
        print(f"Reset {cur.rowcount} user statistics.")
        
        # 3. Clean match history & guesses
        cur.execute("DELETE FROM guesses")
        print(f"Deleted {cur.rowcount} guesses.")
        
        cur.execute("DELETE FROM games")
        print(f"Deleted {cur.rowcount} games.")
        
        cur.execute("DELETE FROM chat_messages")
        print(f"Deleted {cur.rowcount} chat messages.")
        
        conn.commit()
        
        cur.execute("SELECT id, username, email, wins, losses, xp, coins, level FROM users")
        rows = cur.fetchall()
        print(f"Active users ({len(rows)}):")
        for r in rows:
            print(" ", r)
        conn.close()
    except Exception as e:
        print(f"Error on {db_path}: {e}")
