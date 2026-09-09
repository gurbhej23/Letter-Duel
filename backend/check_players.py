"""
Letter Duel — Player & Database Inspector CLI Tool

Inspect player accounts, ratings, ranks, coin balances, match records, and rooms
in either the local SQLite database or the remote Render PostgreSQL database.

Usage:
  # Check local SQLite database:
  python check_players.py

  # Check remote Render PostgreSQL database:
  python check_players.py --pg "postgresql://letter_duel_db_user:mNssgS5AFgIgzzMs8crCwnM3fBIAraLe@dpg-dagiqr95efls73apjeeg-a.singapore-postgres.render.com/letter_duel_db"

  # Search for a specific player:
  python check_players.py --user saajan
  python check_players.py --pg "<URL>" --user gurbhej

  # Filter out automated test accounts (show only real players):
  python check_players.py --real-only
"""

import os
import sys
import argparse
from sqlalchemy import create_engine, text
from app.config import settings

def parse_args():
    parser = argparse.ArgumentParser(description="Inspect Letter Duel players and rooms")
    parser.add_argument(
        "--pg",
        "--url",
        default=None,
        dest="db_url",
        help="Database connection URL (defaults to local SQLite or DATABASE_URL)"
    )
    parser.add_argument(
        "--user",
        default=None,
        help="Search for a specific user by username or ID"
    )
    parser.add_argument(
        "--real-only",
        action="store_true",
        help="Show only real player accounts (hides automated test bots)"
    )
    return parser.parse_args()

def inspect_database():
    args = parse_args()
    db_url = args.db_url or settings.get_database_url()

    if db_url.startswith("postgres://"):
        db_url = "postgresql://" + db_url[len("postgres://"):]

    is_sqlite = db_url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}

    print("=" * 85)
    print(" LETTER DUEL: PLAYER DATABASE INSPECTOR")
    print("=" * 85)
    print(f" Target DB: {'SQLite (Local)' if is_sqlite else 'PostgreSQL (Render)'}")
    print("=" * 85)

    engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)

    with engine.connect() as conn:
        query = "SELECT id, username, email, rank, rating, coins, wins, losses, current_streak, created_at FROM users"
        params = {}

        if args.user:
            if args.user.isdigit():
                query += " WHERE id = :uid"
                params["uid"] = int(args.user)
            else:
                query += " WHERE LOWER(username) LIKE LOWER(:uname)"
                params["uname"] = f"%{args.user}%"
        elif args.real_only:
            query += """ WHERE username NOT LIKE '%178%'
                           AND username NOT LIKE 'TourneyUser%'
                           AND username NOT LIKE 'FlowUser%'
                           AND username NOT LIKE 'ForfeitUser%'
                           AND username NOT LIKE 'guest_%'
                           AND username NOT LIKE 'user_tier_%'
                           AND username NOT LIKE 'winner_settle%'
                           AND username NOT LIKE 'loser_settle%'
            """

        query += " ORDER BY id ASC"

        rows = conn.execute(text(query), params).mappings().all()

        print(f"\nTOTAL PLAYERS FOUND: {len(rows)}")
        print("-" * 85)
        header = f"{'ID':<6} | {'Username':<22} | {'Rank':<12} | {'Rating':<7} | {'Coins':<7} | {'W/L':<7} | {'Created At'}"
        print(header)
        print("-" * 85)

        for u in rows:
            created_str = str(u["created_at"])[:16] if u["created_at"] else "N/A"
            wl = f"{u['wins'] or 0}W/{u['losses'] or 0}L"
            rank_str = u["rank"] or "Bronze III"
            rating_val = u["rating"] or 800
            coins_val = u["coins"] if u["coins"] is not None else 0

            print(f"{u['id']:<6} | {u['username']:<22} | {rank_str:<12} | {rating_val:<7} | {coins_val:<7} | {wl:<7} | {created_str}")

        print("=" * 85)

        # Recent games
        games = conn.execute(text("SELECT id, room_id, player1_id, player2_id, winner_id, status, started_at FROM games ORDER BY id DESC LIMIT 5")).mappings().all()
        print(f"\nRECENT GAMES ({len(games)}):")
        print("-" * 85)
        for g in games:
            print(f"Game #{g['id']}: Room={g['room_id']}, P1={g['player1_id']}, P2={g['player2_id']}, Winner={g['winner_id']}, Status={g['status']}")

        print("=" * 85 + "\n")

if __name__ == "__main__":
    inspect_database()
