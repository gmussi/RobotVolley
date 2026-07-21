/** World dimensions and physics constants. Pure data — no side effects. */

export const W = 1000;
export const H = 600;
export const FLOOR_Y = H - 40;

export const GRAVITY = 2100;
export const BALL_GRAVITY = 880;
export const WIN_SCORE = 5;

export const SERVE_CHARGE_TIME = 4;
export const SERVE_CHARGE_FLOOR = 0.25;
export const SERVE_MIN_SPEED = 120;
export const SERVE_MAX_SPEED = 1200;
export const SERVE_DIR_X = 0.421;
export const SERVE_DIR_Y = -0.907;

export const GROUND_RESTITUTION = 0.72;
export const AIR_RESTITUTION = 1.02;
/** Falling ball hitting the top of a robot — low bounce, redirects sideways. */
export const TOP_FALL_RESTITUTION_GROUND = 0.32;
export const TOP_FALL_RESTITUTION_AIR = 0.52;
export const TOP_FALL_MIN_VY = 60;
/** Minimum upward pop (px/s) when a falling ball hits a grounded robot's head. */
export const TOP_HEAD_MIN_BOUNCE_VY = 400;
/** Max upward rebound as a fraction of incoming fall speed (head hits). */
export const TOP_HEAD_MAX_UP_FRAC_GROUND = 0.5;
export const TOP_HEAD_MAX_UP_FRAC_AIR = 0.65;
export const HIT_SPEED_GAIN = 200;
export const BALL_MAX_SPEED = 1150;

export const NET = {
  w: 14,
  h: 170,
  get x() { return W / 2 - this.w / 2; },
  get top() { return FLOOR_Y - this.h; },
};

export const ROBOT_W = 74;
export const ROBOT_H = 116;
export const MOVE_SPEED = 460;
export const MOVE_ACCEL = 5200;
export const JUMP_V = 960;
export const AIR_ACCEL = 3000;
export const ARM_W = 12;
export const ARM_OVERHANG = 4;
export const COURT_GAP = 2;
export const HEAD_TOP_OFFSET = 2;

export const POWER_JUMP_V = 1250;
export const ROCKET_FLAP_V = 620;
export const ROCKET_MAX_FLAPS = 3;

export const BALL_R = 22;
export const NET_BOUNCE = 0.7;

export const PHYSICS_STEP = 1 / 120;

export const DEFAULT_COLORS = {
  p1: { head: "#ff5a5f", torso: "#ff5a5f", arms: "#b02a2f", legs: "#b02a2f" },
  p2: { head: "#29b6f6", torso: "#29b6f6", arms: "#1565a8", legs: "#1565a8" },
};
