import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import (
    User, Room, Game, Guess, ChatMessage, Friendship,
    Tournament, TournamentParticipant, TournamentMatch, CoinTransaction
)
from app.routes import auth, rooms, friends, leaderboard, history, presence, tournaments
from app.websocket import handler as ws_handler
from app.websocket import tournament_handler as ws_tournament_handler

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Legacy column backfill only if running against SQLite without migrations
if engine.url.drivername.startswith("sqlite"):
    from sqlalchemy import text
    legacy_sqlite_migrations = [
        "ALTER TABLE rooms ADD COLUMN is_private BOOLEAN DEFAULT 0",
        "ALTER TABLE rooms ADD COLUMN entry_fee INTEGER DEFAULT 50",
        "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 500",
        "ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1",
        "ALTER TABLE users ADD COLUMN last_daily_bonus DATETIME",
        "ALTER TABLE tournament_matches ADD COLUMN checkin_deadline DATETIME",
        "ALTER TABLE tournament_matches ADD COLUMN is_forfeit BOOLEAN DEFAULT 0",
        "ALTER TABLE users ADD COLUMN rating INTEGER DEFAULT 800",
        "ALTER TABLE users ADD COLUMN rank VARCHAR(30) DEFAULT 'Bronze III'",
        "ALTER TABLE users ADD COLUMN highest_rank VARCHAR(30) DEFAULT 'Bronze III'",
        "ALTER TABLE users ADD COLUMN welcome_bonus_claimed BOOLEAN DEFAULT 1",
    ]
    for statement in legacy_sqlite_migrations:
        try:
            with engine.connect() as conn:
                conn.execute(text(statement))
                conn.commit()
        except Exception:
            pass

# Ensure dedicated Bot participant exists in database (for foreign-key integrity in Bot matches)
try:
    with SessionLocal() as db_init:
        bot_user = db_init.query(User).filter(User.id == 99999).first()
        if not bot_user:
            bot_user = User(
                id=99999,
                username="BOT",
                email="bot@letterduel.internal",
                password_hash="system_bot_disabled_login",
                avatar="avatar-robot",
                coins=10000,
                rating=800,
                rank="Bronze III"
            )
            db_init.add(bot_user)
            db_init.commit()
except Exception:
    pass

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS configuration supporting production Vercel deployment and local dev
allowed_origins = settings.get_allowed_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https?://.*(\.vercel\.app|\.ngrok-free\.dev|\.ngrok-free\.app|\.ngrok\.io|\.loca\.lt|localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(rooms.router, prefix=settings.API_V1_STR)
app.include_router(friends.router, prefix=settings.API_V1_STR)
app.include_router(presence.router, prefix=settings.API_V1_STR)
app.include_router(leaderboard.router, prefix=settings.API_V1_STR)
app.include_router(history.router, prefix=settings.API_V1_STR)
app.include_router(tournaments.router, prefix=settings.API_V1_STR)
app.include_router(ws_handler.router)
app.include_router(ws_tournament_handler.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME, "version": "1.0.0"}

from fastapi import Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth.deps import get_current_user

@app.get("/api/game/active")
def get_active_game(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.routes.rooms import get_active_room_helper
    return get_active_room_helper(current_user, db)
