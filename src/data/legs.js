/** Robot leg loadouts — `normal` is the standard part; the rest are accessories. */
import { JUMP_V, POWER_JUMP_V, TANK_JUMP_V, TANK_MOVE_SPEED_MUL } from "./constants.js";

export const LEG_TYPES = {
  normal: {
    label: "Robot",
    description: "Normal jump",
    jumpV: JUMP_V,
    moveSpeedMul: 1,
  },
  power: {
    label: "Power",
    description: "Jump higher",
    jumpV: POWER_JUMP_V,
    moveSpeedMul: 1,
  },
  rocket: {
    label: "Rocket",
    description: "Many small jumps — tap repeatedly, like Flappy Bird",
    moveSpeedMul: 1,
  },
  tank: {
    label: "Tank",
    description: "Full tank hull — faster walk, lower jump",
    jumpV: TANK_JUMP_V,
    moveSpeedMul: TANK_MOVE_SPEED_MUL,
  },
};

export const LEG_TYPE_IDS = Object.keys(LEG_TYPES);
