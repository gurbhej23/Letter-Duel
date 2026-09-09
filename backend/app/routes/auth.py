import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, UserProfileUpdate, Token
from app.auth.security import hash_password, verify_password, create_access_token
from app.auth.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=Token)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if username or email exists
    clean_username = user_in.username.strip()
    clean_email = user_in.email.strip().lower()

    if db.query(User).filter(User.username.ilike(clean_username)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already registered."
        )
    if db.query(User).filter(User.email.ilike(clean_email)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already registered."
        )

    user = User(
        username=clean_username,
        email=clean_email,
        password_hash=hash_password(user_in.password),
        avatar=user_in.avatar or "avatar-1",
        coins=100,  # 100 Duel Coins one-time welcome bonus
        level=1,
        rating=800,
        rank="Bronze III",
        highest_rank="Bronze III",
        welcome_bonus_claimed=True,
        xp=0,
        last_seen=datetime.datetime.utcnow()
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Server-authoritative ledger record for 100 Coins Welcome Bonus
    from app.models.coin_transaction import CoinTransaction
    welcome_tx = CoinTransaction(
        user_id=user.id,
        amount=100,
        balance_after=100,
        transaction_type="WELCOME_BONUS",
        reference_id="registration"
    )
    db.add(welcome_tx)
    db.commit()

    from app.routes.friends import touch_user_online
    touch_user_online(user.id)

    token = create_access_token({"sub": str(user.id)})
    return Token(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        welcome_bonus=True
    )

@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    identity = login_data.username_or_email.strip()
    user = db.query(User).filter(
        (User.username.ilike(identity)) | (User.email.ilike(identity))
    ).first()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password."
        )

    # Immediately stamp last_seen and online status in memory
    user.last_seen = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)

    from app.routes.friends import touch_user_online
    touch_user_online(user.id)

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, token_type="bearer", user=UserResponse.model_validate(user))

@router.get("/me", response_model=UserResponse)
def get_me(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Set strict anti-caching headers so browsers, CDNs, and proxies never cache user identity
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    from app.routes.friends import touch_user_online
    touch_user_online(current_user.id)
    return UserResponse.model_validate(current_user)

@router.put("/profile", response_model=UserResponse)
def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if profile_data.username and profile_data.username != current_user.username:
        clean_name = profile_data.username.strip()
        existing = db.query(User).filter(User.username.ilike(clean_name)).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken."
            )
        current_user.username = clean_name

    if profile_data.avatar:
        current_user.avatar = profile_data.avatar

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.post("/daily-bonus")
def claim_daily_bonus(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Claim daily free coins bonus (+200 coins).
    Allowed once every 24 hours, or immediately if user has less than 50 coins (safety net).
    """
    now = datetime.datetime.utcnow()
    is_bankrupt = (current_user.coins or 0) < 50

    if not is_bankrupt and current_user.last_daily_bonus:
        diff = now - current_user.last_daily_bonus
        if diff.total_seconds() < 24 * 3600:
            remaining_seconds = int(24 * 3600 - diff.total_seconds())
            hours = remaining_seconds // 3600
            mins = (remaining_seconds % 3600) // 60
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Daily bonus already claimed! Next refill available in {hours}h {mins}m."
            )

    bonus_amount = 200
    current_user.coins = (current_user.coins or 0) + bonus_amount
    current_user.last_daily_bonus = now
    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "bonus_amount": bonus_amount,
        "coins": current_user.coins,
        "new_coins": current_user.coins,
        "last_daily_bonus": current_user.last_daily_bonus.isoformat() if current_user.last_daily_bonus else None,
        "message": "Bankruptcy safety refill! Claimed +200 Free Coins!" if is_bankrupt else f"Claimed +{bonus_amount} Free Coins!",
        "user": UserResponse.model_validate(current_user)
    }
