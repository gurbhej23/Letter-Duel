# Letter Duel — PostgreSQL Production Guide (Render)

This guide documents the database architecture, deployment process, and migration procedure for running **Letter Duel** on **Render PostgreSQL** in production while retaining zero-friction **SQLite** for local development.

---

## 1. Database Architecture Overview

Letter Duel supports a **dual-database architecture**:

| Environment | Database | Configuration (`DATABASE_URL`) | Connection Behavior |
| :--- | :--- | :--- | :--- |
| **Local Development** | SQLite | `sqlite:///./letter_duel.db` | Single file, `connect_args={"check_same_thread": False}`, zero external setup |
| **Production (Render)** | PostgreSQL | `postgresql://user:pass@host/dbname` | Connection pooling (`pool_pre_ping=True`, `pool_size=10`, `max_overflow=20`), persistent storage |

### Key Engine Features:
- **URL Normalization**: Render provides database connection strings beginning with `postgres://`. SQLAlchemy 1.4+ deprecated this prefix in favor of `postgresql://`. The application automatically normalizes `postgres://` to `postgresql://`.
- **Dialect Compatibility**: Compatible with modern `psycopg` (v3) and `psycopg2-binary` drivers.
- **In-Memory WebSockets + Durable DB Writes**: Real-time 1v1 multiplayer game state and turn timers remain in server memory for ultra-low latency. Durable records (users, matches, guesses, chat messages, friendships, tournaments, coin ledger) are safely persisted to PostgreSQL.
- **Audit-Safe Coin Ledger**: Every coin reward, entry fee deduction, and tournament prize is recorded in `coin_transactions`.

---

## 2. Environment Variables Reference

| Variable | Required in Production | Default (Local Dev) | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | `sqlite:///./letter_duel.db` | PostgreSQL connection string on Render (e.g. `postgresql://user:pass@dpg-...:5432/dbname`) |
| `SECRET_KEY` | **Yes** | Dev fallback string | 64+ char random hex string for signing JWT authentication tokens |
| `BACKEND_CORS_ORIGINS` | Optional | `["https://letterguessword.vercel.app", ...]` | JSON array or comma-separated list of allowed web frontend origins |
| `PYTHON_VERSION` | Recommended | `3.11.9` | Python runtime version on Render |
| `DB_POOL_SIZE` | Optional | `10` | SQLAlchemy connection pool size (PostgreSQL only) |
| `DB_MAX_OVERFLOW` | Optional | `20` | SQLAlchemy maximum temporary overflow connections (PostgreSQL only) |
| `DB_POOL_RECYCLE` | Optional | `300` | Connection recycling interval in seconds |

> [!CAUTION]
> **Never commit `.env` or production secrets to Git.** All secrets must be provided via the Render dashboard or environment configuration.

---

## 3. Render Step-by-Step Deployment

### Step 1: Create a PostgreSQL Database on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **PostgreSQL**.
3. Configure the database:
   - **Name**: `letter-duel-postgres`
   - **Database**: `letter_duel`
   - **User**: `letter_duel_user`
   - **Region**: Choose the **same region** as your backend web service (e.g. `Frankfurt` or `Oregon`) to minimize network latency.
   - **Plan**: Select your desired plan (Free / Starter).
4. Click **Create Database**.

### Step 2: Copy Connection String
- For backend web service running inside Render: Copy the **Internal Database URL** (e.g. `postgres://letter_duel_user:***@dpg-xxx-a:5432/letter_duel`).
- For running data migration script from your local machine: Copy the **External Database URL**.

### Step 3: Configure Render Web Service
1. In the Render Dashboard, navigate to your backend Web Service (`letter-duel-backend`).
2. Go to **Settings**:
   - **Build Command**: `pip install -r requirements.txt`
   - **Pre-Deploy Command**: `alembic upgrade head`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Go to **Environment**:
   - Add/Update `DATABASE_URL`: Paste the **Internal Database URL** from Step 2.
   - Ensure `SECRET_KEY` is set to a secure random value.
4. Save changes. Render will automatically deploy and execute `alembic upgrade head` during pre-deployment to establish all tables.

---

## 4. Alembic Migrations

The database schema is managed version-by-version using Alembic.

### Common Alembic Commands (Run in `backend/` directory)

```powershell
# Apply all pending migrations to the current database
alembic upgrade head

# Check current database revision
alembic current

# View migration history
alembic history --verbose

# Create a new migration after modifying SQLAlchemy models
alembic revision --autogenerate -m "describe_changes"
```

---

## 5. Migrating Existing SQLite Production Data to PostgreSQL

If your production service currently has existing users, games, rooms, coins, or match history in SQLite, run the safe migration tool from your local terminal.

> [!IMPORTANT]
> The migration script inserts parent records before child records (`users` -> `friendships` -> `rooms` -> `games` -> `guesses` -> `chat_messages` -> `tournaments` -> `tournament_participants` -> `tournament_matches` -> `coin_transactions`) and automatically synchronizes all PostgreSQL auto-increment sequences (`setval`).

### Step 5A: Dry-Run (Inspect without writing)
```powershell
python scripts/migrate_sqlite_to_postgres.py --sqlite-path letter_duel.db --pg-url "<Render External Database URL>" --dry-run
```

### Step 5B: Live Migration
```powershell
python scripts/migrate_sqlite_to_postgres.py --sqlite-path letter_duel.db --pg-url "<Render External Database URL>"
```

### Step 5C: Verify Database Row Counts
```powershell
python scripts/verify_db_counts.py --sqlite-path letter_duel.db --target-url "<Render External Database URL>"
```

---

## 6. Post-Deployment Verification Checklist

1. **Health Check**:
   ```
   GET https://<your-backend>.onrender.com/api/health
   Response: {"status": "ok", "app": "Letter Duel", "version": "1.0.0"}
   ```
2. **Active Game Endpoint**:
   ```
   GET https://<your-backend>.onrender.com/api/game/active
   ```
3. **Authentication**:
   - Log in with existing user credentials.
   - Verify `GET /api/auth/me` resolves the authenticated user from the JWT.
   - Verify 401 Unauthorized is returned when no token or invalid token is supplied.
4. **WebSocket Gameplay**:
   - Create private room or queue in Quick Match.
   - Verify turn alternation (YES switches turn, NO switches turn, letter guesses always advance turn).
   - Test reconnection and verify state consistency.
5. **Ledger & Stats**:
   - Verify coins balance and match history record properly.
