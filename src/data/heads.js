/** Robot head loadouts — hitbox dimensions and collision tuning. */
import { BALL_MAX_SPEED } from "./constants.js";

export const HEAD_TYPES = {
  standard: {
    label: "Standard",
    description: "Balanced bounce",
    w: 44,
    h: 34,
    dishAbove: 0,
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
    description: "Flings the ball sideways at full speed",
    w: 44,
    h: 34,
    dishAbove: 0,
    dashMinVx: 120,
    extendW: 18,
    extendH: 24,
    extendOffset: 20,
    // The drill never bounces the ball — it always flings it sideways, toward
    // whichever side of the head was struck, with a little lift.
    //
    // Calibrated so a robot standing at the middle of its own half (centre
    // x = W*0.25), struck on the right of the head, skims the ball over the net
    // at exactly full speed. The binding point is the net's NEAR top corner,
    // not the net centre — the ball's leading edge reaches the net a radius
    // earlier than its centre does, and it is still climbing there. At this
    // angle the underside clears that corner by half a pixel.
    // Locked by "drill skims the ball over the net" in tests/engine.test.js.
    launchSpeed: BALL_MAX_SPEED,
    launchAngleDeg: 18.698,
  },
};

export const HEAD_TYPE_IDS = Object.keys(HEAD_TYPES);
