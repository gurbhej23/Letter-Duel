import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True)

    PROJECT_NAME: str = "Letter Duel"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "letter-duel-ultra-secret-key-change-in-prod-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./letter_duel.db")
    
    # Game rules
    MIN_WORD_LENGTH: int = 5
    MAX_WORD_LENGTH: int = 15
    MAX_WORD_GUESS_ATTEMPTS: int = 3
    DISCONNECT_TIMEOUT_SECONDS: int = 60
    ALLOW_CUSTOM_WORDS_DEFAULT: bool = True
    
    # CORS - Production frontend + local dev origins + ngrok tunnels
    BACKEND_CORS_ORIGINS: list[str] = [
        "https://letterguessword.vercel.app",
        "https://onscreen-twister-habitat.ngrok-free.dev",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    def get_allowed_cors_origins(self) -> list[str]:
        raw = os.getenv("BACKEND_CORS_ORIGINS") or os.getenv("CORS_ORIGINS")
        origins = list(self.BACKEND_CORS_ORIGINS)
        if raw:
            try:
                import json
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    for o in parsed:
                        clean = str(o).strip()
                        if clean and clean != "*" and clean not in origins:
                            origins.append(clean)
            except Exception:
                for o in raw.split(","):
                    clean = o.strip()
                    if clean and clean != "*" and clean not in origins:
                        origins.append(clean)
        # Ensure production Vercel URL and active ngrok origin are always present
        if "https://letterguessword.vercel.app" not in origins:
            origins.insert(0, "https://letterguessword.vercel.app")
        if "https://onscreen-twister-habitat.ngrok-free.dev" not in origins:
            origins.append("https://onscreen-twister-habitat.ngrok-free.dev")
        return origins

settings = Settings()
