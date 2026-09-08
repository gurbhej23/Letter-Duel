import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class TournamentParticipantResponse(BaseModel):
    id: int
    tournament_id: int
    user_id: int
    username: str
    avatar: str
    level: int = 1
    seed: Optional[int] = None
    status: str
    eliminated: bool
    placement: Optional[int] = None
    coins_awarded: int = 0
    xp_awarded: int = 0
    joined_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class TournamentMatchResponse(BaseModel):
    id: int
    tournament_id: int
    round: int
    match_number: int
    player1_id: Optional[int] = None
    player1_username: Optional[str] = None
    player1_avatar: Optional[str] = None
    player1_level: Optional[int] = 1
    player2_id: Optional[int] = None
    player2_username: Optional[str] = None
    player2_avatar: Optional[str] = None
    player2_level: Optional[int] = 1
    winner_id: Optional[int] = None
    winner_username: Optional[str] = None
    room_code: Optional[str] = None
    status: str
    next_match_id: Optional[int] = None
    next_match_slot: Optional[int] = None
    checkin_deadline: Optional[datetime.datetime] = None
    is_forfeit: bool = False
    started_at: Optional[datetime.datetime] = None
    finished_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TournamentDetailResponse(BaseModel):
    id: int
    name: str
    status: str
    max_players: int
    current_players: int
    winner_id: Optional[int] = None
    winner_username: Optional[str] = None
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    finished_at: Optional[datetime.datetime] = None
    participants: List[TournamentParticipantResponse] = []
    matches: List[TournamentMatchResponse] = []

    model_config = ConfigDict(from_attributes=True)


class TournamentSummaryResponse(BaseModel):
    id: int
    name: str
    status: str
    max_players: int
    current_players: int
    winner_id: Optional[int] = None
    winner_username: Optional[str] = None
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    finished_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TournamentHistoryEntry(BaseModel):
    tournament_id: int
    tournament_name: str
    status: str
    placement: Optional[int] = None
    placement_title: str
    coins_awarded: int = 0
    xp_awarded: int = 0
    winner_username: Optional[str] = None
    date: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
