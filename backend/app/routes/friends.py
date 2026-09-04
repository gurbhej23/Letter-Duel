from typing import List
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.database import get_db
from app.models.user import User
from app.models.friendship import Friendship
from app.schemas.user import UserResponse
from app.schemas.friend import FriendRequestCreate, FriendshipResponse, FriendItem
from app.auth.deps import get_current_user

router = APIRouter(prefix="/friends", tags=["friends"])

# In-memory invitation storage: receiver_id -> list of invitations
PENDING_INVITATIONS = {}

@router.get("", response_model=List[FriendItem])
def get_friends(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Find all accepted friendships
    friendships = db.query(Friendship).filter(
        and_(
            or_(Friendship.requester_id == current_user.id, Friendship.receiver_id == current_user.id),
            Friendship.status == "ACCEPTED"
        )
    ).all()

    items = []
    now = datetime.datetime.now(datetime.timezone.utc)
    for f in friendships:
        friend_user = f.receiver if f.requester_id == current_user.id else f.requester
        # Online if active in last 10 minutes
        is_online = "offline"
        if friend_user.last_seen:
            # handle timezone if needed
            diff = (now.replace(tzinfo=None) - friend_user.last_seen.replace(tzinfo=None)).total_seconds()
            if diff < 300:
                is_online = "online"
            elif diff < 1800:
                is_online = "in-game"
        
        items.append(FriendItem(
            friendship_id=f.id,
            user=UserResponse.model_validate(friend_user),
            status=is_online
        ))

    return items

@router.get("/requests/pending", response_model=List[FriendshipResponse])
def get_pending_requests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    requests = db.query(Friendship).filter(
        Friendship.receiver_id == current_user.id,
        Friendship.status == "PENDING"
    ).all()
    return [FriendshipResponse.model_validate(r) for r in requests]

@router.post("/request", response_model=FriendshipResponse)
def send_friend_request(
    request_in: FriendRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    receiver_name = request_in.receiver_username.strip()
    receiver = db.query(User).filter(User.username.ilike(receiver_name)).first()
    if not receiver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if receiver.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot friend yourself.")

    # Check existing relationship
    existing = db.query(Friendship).filter(
        or_(
            and_(Friendship.requester_id == current_user.id, Friendship.receiver_id == receiver.id),
            and_(Friendship.requester_id == receiver.id, Friendship.receiver_id == current_user.id)
        )
    ).first()

    if existing:
        if existing.status == "ACCEPTED":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You are already friends.")
        elif existing.status == "PENDING":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A friend request is already pending.")
        else:
            existing.status = "PENDING"
            existing.requester_id = current_user.id
            existing.receiver_id = receiver.id
            db.commit()
            db.refresh(existing)
            return FriendshipResponse.model_validate(existing)

    new_friendship = Friendship(
        requester_id=current_user.id,
        receiver_id=receiver.id,
        status="PENDING"
    )
    db.add(new_friendship)
    db.commit()
    db.refresh(new_friendship)

    return FriendshipResponse.model_validate(new_friendship)

@router.post("/accept/{friendship_id}", response_model=FriendshipResponse)
def accept_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    friendship = db.query(Friendship).filter(
        Friendship.id == friendship_id,
        Friendship.receiver_id == current_user.id
    ).first()

    if not friendship:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found.")

    friendship.status = "ACCEPTED"
    db.commit()
    db.refresh(friendship)
    return FriendshipResponse.model_validate(friendship)

@router.post("/reject/{friendship_id}")
def reject_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    friendship = db.query(Friendship).filter(
        Friendship.id == friendship_id,
        Friendship.receiver_id == current_user.id
    ).first()

    if not friendship:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found.")

    friendship.status = "REJECTED"
    db.commit()
    return {"message": "Friend request rejected."}

@router.delete("/{friendship_id}")
def remove_friend(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    friendship = db.query(Friendship).filter(
        Friendship.id == friendship_id,
        or_(Friendship.requester_id == current_user.id, Friendship.receiver_id == current_user.id)
    ).first()

    if not friendship:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friendship not found.")

    db.delete(friendship)
    db.commit()
    return {"message": "Friend removed."}

@router.get("/search", response_model=List[UserResponse])
def search_users(
    query: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_q = query.strip()
    if not clean_q:
        return []
    users = db.query(User).filter(
        User.username.ilike(f"%{clean_q}%"),
        User.id != current_user.id
    ).limit(10).all()
    return [UserResponse.model_validate(u) for u in users]

@router.post("/invite")
def invite_friend_to_room(
    receiver_id: int,
    room_code: str,
    current_user: User = Depends(get_current_user)
):
    if receiver_id not in PENDING_INVITATIONS:
        PENDING_INVITATIONS[receiver_id] = []
    
    PENDING_INVITATIONS[receiver_id].append({
        "sender_id": current_user.id,
        "sender_username": current_user.username,
        "sender_avatar": current_user.avatar,
        "room_code": room_code,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })
    return {"message": f"Invitation sent to player."}

@router.get("/invites")
def get_my_invitations(current_user: User = Depends(get_current_user)):
    invites = PENDING_INVITATIONS.get(current_user.id, [])
    # Clear after retrieval
    PENDING_INVITATIONS[current_user.id] = []
    return invites
