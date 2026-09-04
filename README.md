# ⚔️ Letter Duel — Real-Time Multiplayer Word Guessing Game

**Letter Duel** is a 2-player competitive real-time word guessing game. Each duelist secretly locks a word (5–15 letters). Players only know the number of letters in their opponent's word and take turns guessing **one letter at a time**.

---

## ⚡ Core Turn Rule

> **EVERY GUESS ALWAYS SWITCHES TURNS.**
> - Guessing a letter that exists (**YES**) ends your turn.
> - Guessing a letter that does not exist (**NO**) ends your turn.
> - **YES does NOT grant another turn.**
> - **NO does NOT grant another turn.**
> - A player never makes consecutive guesses.

---

## 🚀 Quick Start

### 1. Backend (FastAPI + WebSockets)
```bash
cd backend
python -m venv .venv
# Activate venv:
.\.venv\Scripts\activate   # Windows
# or: source .venv/bin/activate # macOS/Linux

pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

Visit **`http://localhost:5173`** (or `http://localhost:5174`) in two separate browser windows to test the live multiplayer duel flow!

---

## 🎮 Game Walkthrough
1. **Player 1**: Register/Login, click **Create Room**, receive a 6-character code (e.g. `K8Q4XM`), and copy the code.
2. **Player 2**: Register/Login, click **Join Room**, enter `K8Q4XM`.
3. Both players click **I AM READY!**
4. Both players enter and lock their **Secret Word** (5–15 letters, e.g. `BANANAS` and `APPLE`).
5. **Duel Begins**:
   - Player 1 clicks letter **A** → Server validates against Player 2's secret word → **YES**!
   - Slot flips open. **Turn switches immediately to Player 2.**
   - Player 2 clicks letter **B** → Server validates against Player 1's secret word → **YES**!
   - Slot flips open. **Turn switches immediately to Player 1.**
   - Letters can also be guessed via **Guess Full Word** (max 3 attempts).
6. **Victory & Rematch**: Winner is announced with confetti, XP awarded (+100 XP / +25 XP), secret words revealed, and instant rematch voting enabled.

---

## 🧪 Automated Testing
```bash
# Run backend engine, REST, and multiplayer e2e tests
.\backend\.venv\Scripts\pytest
```
