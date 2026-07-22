/** Robot head loadouts — hitbox dimensions and collision tuning. */

export const HEAD_TYPES = {
  standard: {
    label: "Standard",
    description: "Balanced bounce",
    w: 44,
    h: 34,
    dishAbove: 0,
  },
  dome: {
    label: "Dome",
    description: "High pop, less control",
    w: 52,
    h: 28,
    dishAbove: 0,
    restitutionBonus: 0.22,
    minBounceVy: 520,
    lateralMul: 0.67,
  },
  magnet: {
    label: "Magnet",
    description: "Sticky carry then sling",
    w: 44,
    h: 34,
    dishAbove: 0,
    carryTime: 0.18,
    releaseVy: -450,
    releaseVxMul: 1.4,
    releaseFacingBoost: 120,
  },
  drill: {
    label: "Drill",
    description: "Dash shove bonus",
    w: 44,
    h: 34,
    dishAbove: 0,
    dashMinVx: 120,
    shoveMinVx: 150,
    shoveBoost: 320,
    extendW: 18,
    extendH: 24,
    extendOffset: 20,
  },
  satellite: {
    label: "Satellite",
    description: "Tall reach, soft chest",
    w: 44,
    h: 34,
    dishAbove: 22,
    torsoRestitutionMul: 0.78,
  },
};

export const HEAD_TYPE_IDS = Object.keys(HEAD_TYPES);
