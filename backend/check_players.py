import sys
from app.database import SessionLocal
from app.models.user import User
from app.models.room import Room

def check_players():
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.id.asc()).all()
        print("\n" + "=" * 80)
        print(f" TOTAL PLAYERS IN DATABASE: {len(users)}")
        print("=" * 80)

        if not users:
            print(" No players found in the database.")
            print("=" * 80 + "\n")
            return

        header = f"{'ID':<4} | {'Username':<15} | {'Rank':<14} | {'Rating':<7} | {'Coins':<8} | {'W/L':<8} | {'Streak':<6} | {'Created'}"
        print(header)
        print("-" * 80)

        for u in users:
            created_str = u.created_at.strftime("%Y-%m-%d %H:%M") if hasattr(u, "created_at") and u.created_at else "N/A"
            wl = f"{u.wins or 0}W/{u.losses or 0}L"
            rank_display = getattr(u, "rank", "Bronze III") or "Bronze III"
            rating_display = getattr(u, "rating", 800) or 800
            coins_display = u.coins if u.coins is not None else 100
            streak_display = getattr(u, "current_streak", 0) or 0

            print(f"{u.id:<4} | {u.username:<15} | {rank_display:<14} | {rating_display:<7} | {coins_display:<8} | {wl:<8} | {streak_display:<6} | {created_str}")

        print("=" * 80)

        rooms = db.query(Room).all()
        print(f" TOTAL ROOMS: {len(rooms)}")
        if rooms:
            print("-" * 80)
            for r in rooms:
                print(f"Room {r.room_code}: Status={r.status}, P1={r.player1_id}, P2={r.player2_id}, Stake={r.entry_fee}")
        print("=" * 80 + "\n")

    finally:
        db.close()

if __name__ == "__main__":
    check_players()
