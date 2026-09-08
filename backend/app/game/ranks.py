"""
Competitive Rank System for Letter Duel.

Ranks & Divisions:
- Bronze: III (800-866), II (867-933), I (934-999)
- Silver: III (1000-1066), II (1067-1133), I (1134-1199)
- Gold: III (1200-1266), II (1267-1333), I (1334-1399)
- Platinum: III (1400-1466), II (1467-1533), I (1534-1599)
- Diamond: III (1600-1666), II (1667-1733), I (1734-1799)
- Master: (1800-1999)
- Grandmaster: (2000+)

Starting rank: Bronze III (Rating 800)
"""

from typing import Tuple

# Rank tier list in ascending competitive order
RANK_TIER_ORDER = [
    "Bronze III",
    "Bronze II",
    "Bronze I",
    "Silver III",
    "Silver II",
    "Silver I",
    "Gold III",
    "Gold II",
    "Gold I",
    "Platinum III",
    "Platinum II",
    "Platinum I",
    "Diamond III",
    "Diamond II",
    "Diamond I",
    "Master",
    "Grandmaster"
]

RANK_THRESHOLDS = [
    (2000, "Grandmaster"),
    (1800, "Master"),
    (1734, "Diamond I"),
    (1667, "Diamond II"),
    (1600, "Diamond III"),
    (1534, "Platinum I"),
    (1467, "Platinum II"),
    (1400, "Platinum III"),
    (1334, "Gold I"),
    (1267, "Gold II"),
    (1200, "Gold III"),
    (1134, "Silver I"),
    (1067, "Silver II"),
    (1000, "Silver III"),
    (934, "Bronze I"),
    (867, "Bronze II"),
    (800, "Bronze III"),
]

def calculate_rank_from_rating(rating: int) -> str:
    """Computes the user's competitive rank based on hidden MMR rating."""
    for threshold, rank_name in RANK_THRESHOLDS:
        if rating >= threshold:
            return rank_name
    return "Bronze III"

def get_rank_tier_index(rank: str) -> int:
    """Returns the numeric tier index for comparing ranks."""
    try:
        return RANK_TIER_ORDER.index(rank)
    except ValueError:
        return 0

def is_rank_eligible(user_rank: str, min_rank: str) -> bool:
    """Checks if a user's rank meets or exceeds the minimum required rank."""
    user_idx = get_rank_tier_index(user_rank)
    min_idx = get_rank_tier_index(min_rank)
    return user_idx >= min_idx

def calculate_rating_change(
    is_winner: bool,
    current_rating: int,
    opponent_rating: int = 800,
    win_streak: int = 0
) -> Tuple[int, int]:
    """
    Calculates the rating change and new rating.
    
    Rules:
    - Base Win: +25 rating
    - Streak Bonus: +5 if streak >= 3
    - Base Loss: -15 rating
    - Minimum floor: 800 (cannot drop below 800)
    - Prevents client-side manipulation and wild swings.
    
    Returns (delta, new_rating).
    """
    if is_winner:
        delta = 25
        if win_streak >= 3:
            delta += 5
        # Slight underdog bonus if opponent was higher rating
        if opponent_rating > current_rating:
            bonus = min(10, (opponent_rating - current_rating) // 50)
            delta += bonus
        new_rating = current_rating + delta
    else:
        delta = -15
        # If opponent was lower rating, loss is slightly higher (up to -20)
        if opponent_rating < current_rating:
            extra = min(5, (current_rating - opponent_rating) // 50)
            delta -= extra
        new_rating = max(800, current_rating + delta)
        delta = new_rating - current_rating

    return delta, new_rating
