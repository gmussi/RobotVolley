/** Robot torso loadouts — weight/mobility multipliers and hitbox offsets. */

const BASE = {
  jumpMul: 1,
  moveSpeedMul: 1,
  groundAccelMul: 1,
  airAccelMul: 1,
  airGravityMul: 1,
  squashMul: 1,
  torsoXOff: 0,
  torsoYOff: 0,
  torsoWExtra: 0,
  torsoHExtra: 0,
};

export const TORSO_TYPES = {
  standard: {
    label: "Standard",
    ...BASE,
  },
  heavy: {
    label: "Heavy",
    ...BASE,
    jumpMul: 0.85,
    moveSpeedMul: 0.92,
    groundAccelMul: 1.15,
    airAccelMul: 0.90,
    squashMul: 1.35,
  },
  light: {
    label: "Light",
    ...BASE,
    jumpMul: 1.10,
    moveSpeedMul: 1.05,
    groundAccelMul: 0.90,
    airAccelMul: 1.10,
    airGravityMul: 0.95,
    squashMul: 0.75,
  },
  lowCoG: {
    label: "Low CoG",
    ...BASE,
    jumpMul: 0.95,
    moveSpeedMul: 0.95,
    groundAccelMul: 1.10,
    airAccelMul: 0.85,
    squashMul: 1.10,
    torsoYOff: 8,
    torsoHExtra: -6,
  },
};

export const TORSO_TYPE_IDS = Object.keys(TORSO_TYPES);
