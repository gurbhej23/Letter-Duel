# Letter Duel — Backend Service

High-performance real-time multiplayer game server built with **FastAPI**, **WebSockets**, and **SQLAlchemy**.

## Features
- **Authoritative Game State Engine**: Enforces strict turn alternation on every letter guess, zero-knowledge secret word privacy, repeated letter revelation, full-word attempts, and game termination.
- **Real-Time WebSockets**: Handles state synchronization, turn broadcasting, instant chat, typing indicators, and 60-second disconnect timeout forfeits.
- **REST APIs**: JWT authentication, 6-character room generation, friends system, global leaderboard, and match history.
- **Database**: SQLite (out-of-the-box) structured with SQLAlchemy 2.0 models ready for PostgreSQL in production.

## Running Locally

```bash
# 1. Activate virtual environment
# On Windows:
.\.venv\Scripts\activate
# On Linux / macOS:
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start development server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Running Tests
```bash
pytest
```
