/**
 * Letter Duel Competitive Rank System Utility
 * 
 * Ranks & Divisions:
 * - Bronze: III (800-866), II (867-933), I (934-999)
 * - Silver: III (1000-1066), II (1067-1133), I (1134-1199)
 * - Gold: III (1200-1266), II (1267-1333), I (1334-1399)
 * - Platinum: III (1400-1466), II (1467-1533), I (1534-1599)
 * - Diamond: III (1600-1666), II (1667-1733), I (1734-1799)
 * - Master: (1800-1999)
 * - Grandmaster: (2000+)
 */

export const RANK_TIER_ORDER = [
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
];

export const RANK_THRESHOLDS = [
  { rank: "Grandmaster", tier: "Grandmaster", division: "", min: 2000, max: 99999, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Master", tier: "Master", division: "", min: 1800, max: 1999, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Diamond I", tier: "Diamond", division: "I", min: 1734, max: 1799, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Diamond II", tier: "Diamond", division: "II", min: 1667, max: 1733, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Diamond III", tier: "Diamond", division: "III", min: 1600, max: 1666, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Platinum I", tier: "Platinum", division: "I", min: 1534, max: 1599, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Platinum II", tier: "Platinum", division: "II", min: 1467, max: 1533, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Platinum III", tier: "Platinum", division: "III", min: 1400, max: 1466, arenaUnlock: "Champion Arena (250🪙)" },
  { rank: "Gold I", tier: "Gold", division: "I", min: 1334, max: 1399, arenaUnlock: "Master Arena (100🪙)" },
  { rank: "Gold II", tier: "Gold", division: "II", min: 1267, max: 1333, arenaUnlock: "Master Arena (100🪙)" },
  { rank: "Gold III", tier: "Gold", division: "III", min: 1200, max: 1266, arenaUnlock: "Master Arena (100🪙)" },
  { rank: "Silver I", tier: "Silver", division: "I", min: 1134, max: 1199, arenaUnlock: "Warrior Arena (50🪙)" },
  { rank: "Silver II", tier: "Silver", division: "II", min: 1067, max: 1133, arenaUnlock: "Warrior Arena (50🪙)" },
  { rank: "Silver III", tier: "Silver", division: "III", min: 1000, max: 1066, arenaUnlock: "Warrior Arena (50🪙)" },
  { rank: "Bronze I", tier: "Bronze", division: "I", min: 934, max: 999, arenaUnlock: "Apprentice Arena (25🪙)" },
  { rank: "Bronze II", tier: "Bronze", division: "II", min: 867, max: 933, arenaUnlock: "Apprentice Arena (25🪙)" },
  { rank: "Bronze III", tier: "Bronze", division: "III", min: 800, max: 866, arenaUnlock: "Rookie Arena (10🪙)" }
];

export const RANK_INFO = {
  "Bronze": {
    badge: "🥉",
    color: "#cd7f32",
    glow: "rgba(205, 127, 50, 0.4)",
    bg: "rgba(205, 127, 50, 0.12)",
    border: "rgba(205, 127, 50, 0.45)",
    gradient: "linear-gradient(135deg, #cd7f32, #8c531b)",
    desc: "Entry league for aspiring duelists."
  },
  "Silver": {
    badge: "🥈",
    color: "#cbd5e1",
    glow: "rgba(203, 213, 225, 0.4)",
    bg: "rgba(203, 213, 225, 0.12)",
    border: "rgba(203, 213, 225, 0.45)",
    gradient: "linear-gradient(135deg, #e2e8f0, #94a3b8)",
    desc: "Tactical duelists with proven vocabulary."
  },
  "Gold": {
    badge: "🥇",
    color: "#ffb300",
    glow: "rgba(255, 179, 0, 0.45)",
    bg: "rgba(255, 179, 0, 0.15)",
    border: "rgba(255, 179, 0, 0.45)",
    gradient: "linear-gradient(135deg, #ffd700, #ffb300)",
    desc: "Seasoned wordsmiths who dominate mid-tier arenas."
  },
  "Platinum": {
    badge: "💠",
    color: "#00f2fe",
    glow: "rgba(0, 242, 254, 0.45)",
    bg: "rgba(0, 242, 254, 0.15)",
    border: "rgba(0, 242, 254, 0.45)",
    gradient: "linear-gradient(135deg, #00f2fe, #4facfe)",
    desc: "Elite masters with high streak multipliers."
  },
  "Diamond": {
    badge: "💎",
    color: "#a78bfa",
    glow: "rgba(167, 139, 250, 0.5)",
    bg: "rgba(167, 139, 250, 0.16)",
    border: "rgba(167, 139, 250, 0.45)",
    gradient: "linear-gradient(135deg, #c084fc, #a78bfa)",
    desc: "Prestige tier for flawless letter predictors."
  },
  "Master": {
    badge: "👑",
    color: "#ff2a6d",
    glow: "rgba(255, 42, 109, 0.5)",
    bg: "rgba(255, 42, 109, 0.16)",
    border: "rgba(255, 42, 109, 0.45)",
    gradient: "linear-gradient(135deg, #ff2a6d, #ff5e62)",
    desc: "Top 1% elite competitive gladiators."
  },
  "Grandmaster": {
    badge: "🔱",
    color: "#00e676",
    glow: "rgba(0, 230, 118, 0.6)",
    bg: "rgba(0, 230, 118, 0.18)",
    border: "rgba(0, 230, 118, 0.45)",
    gradient: "linear-gradient(135deg, #00e676, #00f2fe)",
    desc: "The pinnacle of Letter Duel supremacy."
  }
};

export function getRankTierName(rankString = "Bronze III") {
  return rankString.split(" ")[0] || "Bronze";
}

export function getRankMeta(rankString = "Bronze III") {
  const tier = getRankTierName(rankString);
  return RANK_INFO[tier] || RANK_INFO["Bronze"];
}

export function getRankTierIndex(rankString = "Bronze III") {
  const idx = RANK_TIER_ORDER.indexOf(rankString);
  return idx !== -1 ? idx : 0;
}

export function isRankEligible(userRank = "Bronze III", requiredRank = "Bronze III") {
  return getRankTierIndex(userRank) >= getRankTierIndex(requiredRank);
}

export function calculateRankFromRating(rating = 800) {
  const numRating = Math.max(800, Number(rating) || 800);
  for (const t of RANK_THRESHOLDS) {
    if (numRating >= t.min) {
      return t.rank;
    }
  }
  return "Bronze III";
}

/**
 * Calculates current progress within the active division towards the next rank.
 * Returns percentage (0-100), points remaining, next rank name, and estimated wins needed.
 */
export function getRankProgress(rating = 800) {
  const numRating = Math.max(800, Number(rating) || 800);
  const currentRank = calculateRankFromRating(numRating);
  const currentTier = getRankTierName(currentRank);
  const meta = getRankMeta(currentRank);

  // Find index in RANK_THRESHOLDS (which is sorted high to low)
  const thresholdIdx = RANK_THRESHOLDS.findIndex(t => t.rank === currentRank);
  const currentThreshold = RANK_THRESHOLDS[thresholdIdx] || RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];

  // If already at Grandmaster (highest rank)
  if (currentRank === "Grandmaster") {
    return {
      currentRank,
      currentTier,
      rating: numRating,
      minRating: 2000,
      maxRating: Infinity,
      nextRank: null,
      nextThreshold: null,
      pointsNeeded: 0,
      percent: 100,
      estimatedWins: 0,
      isMaxRank: true,
      meta,
      nextMeta: null
    };
  }

  // Next rank is the one immediately above it in RANK_THRESHOLDS
  const nextThreshold = RANK_THRESHOLDS[thresholdIdx - 1];
  const nextRank = nextThreshold ? nextThreshold.rank : "Grandmaster";
  const nextMin = nextThreshold ? nextThreshold.min : 2000;
  const currentMin = currentThreshold.min;

  const span = Math.max(1, nextMin - currentMin);
  const earnedInTier = Math.max(0, numRating - currentMin);
  const pointsNeeded = Math.max(0, nextMin - numRating);
  const percent = Math.min(100, Math.max(0, Math.round((earnedInTier / span) * 100)));
  const estimatedWins = Math.max(1, Math.ceil(pointsNeeded / 25));

  return {
    currentRank,
    currentTier,
    rating: numRating,
    minRating: currentMin,
    maxRating: nextMin - 1,
    nextRank,
    nextThreshold: nextMin,
    pointsNeeded,
    percent,
    estimatedWins,
    isMaxRank: false,
    meta,
    nextMeta: getRankMeta(nextRank)
  };
}
