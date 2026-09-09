# Letter Duel: Production PostgreSQL Migration Walkthrough

This document summarizes the complete migration of the Letter Duel production backend from SQLite to PostgreSQL for Render, while maintaining zero-overhead SQLite compatibility for local development.

---

## 1. Database Architecture: Before vs. After

```
BEFORE (SQLite Only):
+-------------------------+
|      FastAPI App        |
+-------------------------+
             |
   (Single Engine: SQLite)
             |
             v
+-------------------------+
| letter_duel.db (Disk)   |   <-- Single ephemeral file on Render
+-------------------------+

AFTER (Dual Engine: Local SQLite + Render PostgreSQL):
+-------------------------------------------------------------+
|                         FastAPI App                         |
+-------------------------------------------------------------+
             |                                     |
   (Local Dev: SQLite)                   (Production: Render PG)
             |                                     |
             v                                     v
+-------------------------+             +----------------------+
| letter_duel.db (Local)  |             | Render PostgreSQL    |
| - check_same_thread     |             | - Connection Pooling |
| - zero external setup   |             | - pool_pre_ping=True |
+-------------------------+             | - Persistent Cloud DB|
                                        +----------------------+
```

| Component | Before (Current SQLite) | After (Dual Engine: Local SQLite + Render PostgreSQL) |
| :--- | :--- | :--- |
| **Production DB** | SQLite file (`letter_duel.db`) on ephemeral disk | Managed PostgreSQL on Render with persistent storage |
| **Local Dev DB** | SQLite file (`letter_duel.db`) | Continues default SQLite (`DATABASE_URL=sqlite:///./letter_duel.db`) |
| **PostgreSQL Driver** | None | `psycopg` (v3) / `psycopg2-binary` (modern, Python 3.13-compatible) |
| **Connection Pooling**| Basic `create_engine` with SQLite-only args | `pool_pre_ping=True`, `pool_size=10`, `max_overflow=20`, `pool_recycle=300` for Postgres; `check_same_thread=False` only for SQLite |
| **URL Handling** | Static string | Auto-normalizes Render `postgres://` to `postgresql://` |
| **Schema Management**| Ad-hoc `ALTER TABLE` blocks in `main.py` | Official **Alembic** migrations (`alembic upgrade head`) |
| **Data Migration** | Manual / none | CLI script (`scripts/migrate_sqlite_to_postgres.py`) with FK dependency ordering & sequence resets |
| **Data Verification** | Manual | Verification script (`scripts/verify_db_counts.py`) comparing record counts |

---

## 2. Files Changed & Why

| File | Change Type | Purpose |
| :--- | :--- | :--- |
| [backend/requirements.txt](file:///d:/saajan/WordGuessGame/backend/requirements.txt) | **MODIFY** | Added `psycopg[binary]>=3.2.0`, `psycopg2-binary>=2.9.10`, and `alembic>=1.13.0`. |
| [backend/app/config.py](file:///d:/saajan/WordGuessGame/backend/app/config.py) | **MODIFY** | Added URL normalizer `get_database_url()` converting Render's `postgres://` prefix to `postgresql://`, and added pool configuration settings. |
| [backend/app/database.py](file:///d:/saajan/WordGuessGame/backend/app/database.py) | **MODIFY** | Implemented dual-engine creation: SQLite receives `check_same_thread=False` (no pooling arguments); PostgreSQL receives production connection pooling (`pool_pre_ping=True`, `pool_size`, `max_overflow`, `pool_recycle`). |
| [backend/app/main.py](file:///d:/saajan/WordGuessGame/backend/app/main.py) | **MODIFY** | Added `CoinTransaction` to model imports and scoped legacy SQLite raw `ALTER TABLE` snippets strictly to SQLite environments. |
| [backend/alembic.ini](file:///d:/saajan/WordGuessGame/backend/alembic.ini) | **NEW** | Alembic configuration file. |
| [backend/alembic/env.py](file:///d:/saajan/WordGuessGame/backend/alembic/env.py) | **NEW** | Configured Alembic to dynamically load `DATABASE_URL` via `settings.get_database_url()`, and imported `Base.metadata` covering all 10 models. |
| [backend/alembic/versions/f187b420f5c0_initial_schema.py](file:///d:/saajan/WordGuessGame/backend/alembic/versions/f187b420f5c0_initial_schema.py) | **NEW** | Baseline migration defining all 10 tables: `users`, `friendships`, `rooms`, `games`, `guesses`, `chat_messages`, `tournaments`, `tournament_participants`, `tournament_matches`, `coin_transactions`. |
| [backend/scripts/migrate_sqlite_to_postgres.py](file:///d:/saajan/WordGuessGame/backend/scripts/migrate_sqlite_to_postgres.py) | **NEW** | Standalone data migration script with parent-first foreign-key ordering, boolean/datetime normalization, idempotent deduplication, and PostgreSQL sequence synchronization (`setval`). |
| [backend/scripts/verify_db_counts.py](file:///d:/saajan/WordGuessGame/backend/scripts/verify_db_counts.py) | **NEW** | Non-sensitive record count comparison script for SQLite vs. target database. |
| [render.yaml](file:///d:/saajan/WordGuessGame/render.yaml) | **MODIFY** | Updated Render blueprint with `preDeployCommand: alembic upgrade head` and `DATABASE_URL` configuration. |
| [backend/POSTGRES_SETUP.md](file:///d:/saajan/WordGuessGame/backend/POSTGRES_SETUP.md) | **NEW** | Step-by-step production setup and deployment manual for Render PostgreSQL. |
| [backend/tests/test_database_compatibility.py](file:///d:/saajan/WordGuessGame/backend/tests/test_database_compatibility.py) | **NEW** | Unit test suite verifying URL normalization, metadata registration for all 10 tables, and Alembic migration execution. |

---

## 3. SQLite -> PostgreSQL Data Migration Command

To migrate existing production records from `letter_duel.db` to your Render PostgreSQL instance:

### Step 1: Dry-Run (Inspect counts without writing)
```powershell
python scripts/migrate_sqlite_to_postgres.py --sqlite-path letter_duel.db --pg-url "<Render External Database URL>" --dry-run
```

### Step 2: Live Migration
```powershell
python scripts/migrate_sqlite_to_postgres.py --sqlite-path letter_duel.db --pg-url "<Render External Database URL>"
```

### Step 3: Verification
```powershell
python scripts/verify_db_counts.py --sqlite-path letter_duel.db --target-url "<Render External Database URL>"
```

### Validated Migration Test Output:
```
=================================================================
 MIGRATION SUMMARY
=================================================================
Table                      | Source   | Inserted  | Skipped
-----------------------------------------------------------------
users                      | 61       | 61        | 0
friendships                | 0        | 0         | 0
rooms                      | 20       | 20        | 0
games                      | 4        | 4         | 0
guesses                    | 10       | 10        | 0
chat_messages              | 1        | 1         | 0
tournaments                | 3        | 3         | 0
tournament_participants    | 17       | 17        | 0
tournament_matches         | 14       | 14        | 0
coin_transactions          | 33       | 33        | 0
=================================================================
[OK] Migration successfully finished!
```

---

## 4. Render Setup & Environment Variables

### Environment Variables

| Variable | Production (Render) | Local Development |
| :--- | :--- | :--- |
| `DATABASE_URL` | `<Render Internal Database URL>` | `sqlite:///./letter_duel.db` |
| `SECRET_KEY` | `<Secure Random Secret>` | Dev fallback string |
| `BACKEND_CORS_ORIGINS` | `["https://letterguessword.vercel.app"]` | Local origins |
| `PYTHON_VERSION` | `3.11.9` | Installed Python (3.13) |

### Render Service Settings:
- **Build Command**: `pip install -r requirements.txt`
- **Pre-Deploy Command**: `alembic upgrade head`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

---

## 5. Verification & Test Results

The backend test suite was executed:
```powershell
pytest
```
**Results:**
- **42 passed** (all 39 existing game engine, WebSocket, tournament, auth, and staking tests + 3 new database compatibility tests).
- 1v1 gameplay rules verified (turns alternate on both YES and NO; secret words kept secure until game over; coin ledger maintained).
- Clean Git state with all tracked `__pycache__` and `.pyc` files unlinked.
