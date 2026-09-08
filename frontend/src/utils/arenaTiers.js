import { isRankEligible } from './rankUtils';

export const ARENA_TIERS = [
  {
    fee: 10,
    pot: 20,
    minRank: "Bronze III",
    name: "Rookie Duel",
    requirementLabel: "Everyone",
    icon: "🥉",
    color: "#00f2fe",
    border: "rgba(0, 242, 254, 0.4)",
    bg: "linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(142, 45, 226, 0.08))"
  },
  {
    fee: 25,
    pot: 50,
    minRank: "Bronze II",
    name: "Apprentice Duel",
    requirementLabel: "Bronze II+",
    icon: "🥈",
    color: "#a78bfa",
    border: "rgba(167, 139, 250, 0.4)",
    bg: "linear-gradient(135deg, rgba(167, 139, 250, 0.14), rgba(74, 0, 224, 0.08))"
  },
  {
    fee: 50,
    pot: 100,
    minRank: "Silver III",
    name: "Warrior Duel",
    requirementLabel: "Silver+",
    icon: "🥇",
    color: "#ffb300",
    border: "rgba(255, 179, 0, 0.4)",
    bg: "linear-gradient(135deg, rgba(255, 179, 0, 0.15), rgba(255, 94, 98, 0.08))"
  },
  {
    fee: 100,
    pot: 200,
    minRank: "Gold III",
    name: "Master Duel",
    requirementLabel: "Gold+",
    icon: "💎",
    color: "#ff2a6d",
    border: "rgba(255, 42, 109, 0.45)",
    bg: "linear-gradient(135deg, rgba(255, 42, 109, 0.15), rgba(153, 0, 239, 0.1))"
  },
  {
    fee: 250,
    pot: 500,
    minRank: "Platinum III",
    name: "Champion Duel",
    requirementLabel: "Platinum+",
    icon: "👑",
    color: "#00e676",
    border: "rgba(0, 230, 118, 0.5)",
    bg: "linear-gradient(135deg, rgba(0, 230, 118, 0.18), rgba(0, 176, 255, 0.12))"
  }
];

export function getTierForFee(fee) {
  return ARENA_TIERS.find(t => t.fee === fee) || ARENA_TIERS[0];
}

/**
 * Automatically determine recommended arena based on user rank and coin balance
 */
export function getRecommendedArena(user) {
  if (!user) return ARENA_TIERS[0];
  const userRank = user.rank || "Bronze III";
  const userCoins = user.coins ?? 100;

  // Filter tiers user is rank-eligible for and has at least entry fee
  const eligible = ARENA_TIERS.filter(
    tier => isRankEligible(userRank, tier.minRank) && userCoins >= tier.fee
  );

  if (eligible.length === 0) return ARENA_TIERS[0];

  // Pick the highest affordable tier where user has at least 2x the entry fee
  const safeTiers = eligible.filter(tier => userCoins >= tier.fee * 2);
  if (safeTiers.length > 0) {
    return safeTiers[safeTiers.length - 1];
  }

  // Fallback to highest eligible
  return eligible[eligible.length - 1];
}
