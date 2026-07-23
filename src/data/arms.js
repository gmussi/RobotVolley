/** Robot arm weapons — each triggers a different "attack hit" on the ball. */

export const ARM_TYPES = {
  hand: {
    label: "Hand",
    description: "Orb sweep — smashes the ball",
    kind: "orb",
    cooldown: 1.5,
    hitR: 16,
    // Orb sweeps from 11 o'clock over the top to 3 o'clock in `windup` seconds.
    orbitR: 76,
    windup: 0.4,
    startHour: 11,
    endHour: 15,
    // On connect: contact-based smash (launched along the orb→ball normal),
    // above the normal cap. See smashBall() in engine/game.js.
    smashSpeed: 1320,
  },
  axe: {
    label: "Axe",
    description: "Spinning arc throw — deflects the ball",
    kind: "projectile",
    cooldown: 1.7,
    hitR: 30,
    // Thrown at 1 o'clock, arcs up then down toward the other field.
    launchHour: 13,
    launchSpeed: 720,
    gravity: 900,
    spinRate: 16,
    // On connect: ordinary redirect (kept under the normal speed cap).
    deflectBounce: 1,
    impartVel: 0.45,
  },
  ninjaStar: {
    label: "Ninja Star",
    description: "Straight fast throw — deflects the ball",
    kind: "projectile",
    cooldown: 1.2,
    hitR: 23,
    // Thrown between 1 and 2 o'clock, straight line at fixed speed.
    launchHour: 13.5,
    launchSpeed: 880,
    gravity: 0,
    spinRate: 30,
    deflectBounce: 1,
    impartVel: 0.5,
  },
};

export const ARM_TYPE_IDS = Object.keys(ARM_TYPES);
