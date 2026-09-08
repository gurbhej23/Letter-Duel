export const ARENA_TIERS = [
  {
    fee: 50,
    pot: 100,
    minLevel: 1,
    name: "Novice Duel",
    icon: "🥉",
    color: "#00f2fe",
    border: "rgba(0, 242, 254, 0.4)",
    bg: "linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(142, 45, 226, 0.08))"
  },
  {
    fee: 100,
    pot: 200,
    minLevel: 2,
    name: "Apprentice Arena",
    icon: "🥈",
    color: "#a78bfa",
    border: "rgba(167, 139, 250, 0.4)",
    bg: "linear-gradient(135deg, rgba(167, 139, 250, 0.14), rgba(74, 0, 224, 0.08))"
  },
  {
    fee: 200,
    pot: 400,
    minLevel: 3,
    name: "Warrior Arena",
    icon: "🥇",
    color: "#ffb300",
    border: "rgba(255, 179, 0, 0.4)",
    bg: "linear-gradient(135deg, rgba(255, 179, 0, 0.15), rgba(255, 94, 98, 0.08))"
  },
  {
    fee: 500,
    pot: 1000,
    minLevel: 5,
    name: "Master Arena",
    icon: "💎",
    color: "#ff2a6d",
    border: "rgba(255, 42, 109, 0.45)",
    bg: "linear-gradient(135deg, rgba(255, 42, 109, 0.15), rgba(153, 0, 239, 0.1))"
  },
  {
    fee: 1000,
    pot: 2000,
    minLevel: 10,
    name: "Champion Duel",
    icon: "👑",
    color: "#00e676",
    border: "rgba(0, 230, 118, 0.5)",
    bg: "linear-gradient(135deg, rgba(0, 230, 118, 0.18), rgba(0, 176, 255, 0.12))"
  }
];

export function getTierForFee(fee) {
  return ARENA_TIERS.find(t => t.fee === fee) || ARENA_TIERS[0];
}
