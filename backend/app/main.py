import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import User, Room, Game, Guess, ChatMessage, Friendship
from app.auth.security import hash_password
from app.routes import auth, rooms, friends, leaderboard, history
from app.websocket import handler as ws_handler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("letter_duel")

# Initialize database tables
Base.metadata.create_all(bind=engine)

def seed_sample_data():
    """Seed sample leaderboard players if database is fresh."""
    db = SessionLocal()
    try:
        count = db.query(User).count()
        if count == 0:
            logger.info("Seeding initial players for Letter Duel arena...")
            sample_players = [
                ("Alex", "alex@letterduel.gg", 1450, 42, 8, 7, 12, "avatar-1"),
                ("John", "john@letterduel.gg", 1280, 38, 12, 4, 9, "avatar-2"),
                ("Sarah", "sarah@letterduel.gg", 1120, 31, 15, 5, 8, "avatar-3"),
                ("Cipher", "cipher@letterduel.gg", 950, 26, 11, 3, 6, "avatar-4"),
                ("Valkyrie", "valk@letterduel.gg", 840, 22, 14, 2, 5, "avatar-5"),
            ]
            for username, email, xp, wins, losses, streak, best, avatar in sample_players:
                u = User(
                    username=username,
                    email=email,
                    password_hash=hash_password("Password123!"),
                    avatar=avatar,
                    xp=xp,
                    wins=wins,
                    losses=losses,
                    current_streak=streak,
                    best_streak=best
                )
                db.add(u)
            db.commit()
            logger.info("Sample players seeded successfully.")
    except Exception as e:
        logger.warning(f"Error seeding data: {e}")
    finally:
        db.close()

seed_sample_data()

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(rooms.router, prefix=settings.API_V1_STR)
app.include_router(friends.router, prefix=settings.API_V1_STR)
app.include_router(leaderboard.router, prefix=settings.API_V1_STR)
app.include_router(history.router, prefix=settings.API_V1_STR)
app.include_router(ws_handler.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME, "version": "1.0.0"}
