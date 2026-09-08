/**
 * Letter Duel Competitive Rank System Utility
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

export const RANK_INFO = {
  "Bronze": {
    badge: "🥉",
    color: "#cd7f32",
    glow: "rgba(205, 127, 50, 0.4)",
    bg: "rgba(205, 127, 50, 0.12)"
  },
  "Silver": {
    badge: "🥈",
    color: "#cbd5e1",
    glow: "rgba(203, 213, 225, 0.4)",
    bg: "rgba(203, 213, 225, 0.12)"
  },
  "Gold": {
    badge: "🥇",
    color: "#ffb300",
    glow: "rgba(255, 179, 0, 0.45)",
    bg: "rgba(255, 179, 0, 0.15)"
  },
  "Platinum": {
    badge: "💠",
    color: "#00f2fe",
    glow: "rgba(0, 242, 254, 0.45)",
    bg: "rgba(0, 242, 254, 0.15)"
  },
  "Diamond": {
    badge: "💎",
    color: "#a78bfa",
    glow: "rgba(167, 139, 250, 0.5)",
    bg: "rgba(167, 139, 250, 0.16)"
  },
  "Master": {
    badge: "👑",
    color: "#ff2a6d",
    glow: "rgba(255, 42, 109, 0.5)",
    bg: "rgba(255, 42, 109, 0.16)"
  },
  "Grandmaster": {
    badge: "🔱",
    color: "#00e676",
    glow: "rgba(0, 230, 118, 0.6)",
    bg: "rgba(0, 230, 118, 0.18)"
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
