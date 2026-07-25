/**
 * Robot torso loadout. The torso is no longer a swappable part — every robot uses
 * the standard chassis — so this is a single entry kept for the engine's spec
 * lookup (mobility multipliers and hitbox offsets), not a menu of choices.
 */

export const TORSO_TYPES = {
  standard: {
    label: "Standard",
    description: "Balanced mobility",
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
  },
};

export const TORSO_TYPE_IDS = Object.keys(TORSO_TYPES);
