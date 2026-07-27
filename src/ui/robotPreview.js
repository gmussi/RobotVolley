/**
 * Draws a standalone robot at an arbitrary size — the home screen's profile
 * card and the Profile screen's live preview both use this.
 *
 * It builds one detached robot via the engine's own `makeRobot()` rather than
 * borrowing P1, so previewing a cosmetic can never disturb a match in progress
 * (the attract demo is playing behind the menu while this draws).
 */
import { makeRobot } from "../engine/game.js";
import { drawRobotFigure } from "./robotDraw.js";
import { sanitizeCosmetics } from "../data/cosmetics.js";

/** One reusable instance; nothing here is re-entrant within a frame. */
const previewRobot = makeRobot(-1);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} cosmetics equipped cosmetic ids by slot
 * @param {number} cx centre x
 * @param {number} feetY where the robot's soles land
 * @param {number} scale 1 = on-court size
 */
export function drawRobotPreview(ctx, cosmetics, cx, feetY, scale = 1) {
  const r = previewRobot;
  r.cosmetics = sanitizeCosmetics(cosmetics);
  // Neutral pose: standing, facing the viewer's right, no attack or squash.
  r.facing = 1;
  r.moveDir = 0;
  r.vx = 0;
  r.vy = 0;
  r.onGround = true;
  r.squash = 0;
  r.attack = null;
  r.attackCooldown = 0;
  r.x = -r.w / 2;
  r.y = -r.h;

  ctx.save();
  ctx.translate(cx, feetY);
  ctx.scale(scale, scale);
  // floorY == 0 in this local space, so the contact shadow lands at the soles.
  drawRobotFigure(ctx, r, 0);
  ctx.restore();
}
