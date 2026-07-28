/**
 * The bot's player. Reads the engine's world state and returns the same three
 * inputs a human produces, plus whether the serve key is held.
 *
 * Deliberately separate from `aiControl` in src/engine/game.js: that one drives
 * the 1P CPU opponent and the menu demo, and its behaviour is part of the game.
 * This one exists to be a *credible online opponent*, so it does things the 1P
 * CPU does not — it knows the net is there, it aims its serves, it times the
 * orb sweep instead of mashing, and it can be made deliberately worse so that
 * a fleet of bots isn't a wall of identical experts.
 *
 * Everything reads from the engine and nothing writes to it; the caller turns
 * the returned intent into key presses.
 */
import {
  W, FLOOR_Y, NET, BALL_GRAVITY, BALL_R, NET_BOUNCE, PHYSICS_STEP,
  ROBOT_H, COURT_GAP, ARM_OVERHANG, SERVE_CHARGE_FLOOR, SERVE_CHARGE_TIME,
  SERVE_MIN_SPEED, SERVE_MAX_SPEED, SERVE_DIR_X, SERVE_DIR_Y,
} from "../../src/data/constants.js";
import { ARM_TYPES } from "../../src/data/arms.js";

/**
 * Skill profiles.
 *
 * `reactionMs` is the honest one: the bot acts on a *stale* view of the ball,
 * exactly like a human whose eyes and hands lag. It degrades play in a way that
 * looks like a weaker player rather than a broken one — the bot still moves to
 * the right place, just late. The rest shape style more than strength.
 */
export const SKILLS = {
  easy: {
    reactionMs: 260, aimErrorPx: 90, predictSeconds: 1.2,
    smashChance: 0.2, coverage: 0.75, jumpChance: 0.35, serveErrorPx: 190,
  },
  normal: {
    reactionMs: 140, aimErrorPx: 46, predictSeconds: 2.2,
    smashChance: 0.5, coverage: 0.9, jumpChance: 0.6, serveErrorPx: 110,
  },
  hard: {
    reactionMs: 70, aimErrorPx: 18, predictSeconds: 3.5,
    smashChance: 0.8, coverage: 1, jumpChance: 0.85, serveErrorPx: 50,
  },
  brutal: {
    reactionMs: 0, aimErrorPx: 0, predictSeconds: 4,
    smashChance: 1, coverage: 1, jumpChance: 1, serveErrorPx: 0,
  },
};

export const SKILL_NAMES = Object.keys(SKILLS);

/** Ball state we can simulate forward, decoupled from the engine's live object. */
function snapshotBall(ball) {
  return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, spin: ball.spin };
}

/**
 * Advance a ball snapshot one physics step. Mirrors `updateBall` in the engine
 * for everything that decides *where the ball goes*: gravity, spin drift, the
 * side walls, and — unlike the 1P CPU's `predictBallX` — the net. Missing the
 * net is what makes that one walk confidently under a ball that is about to
 * come straight back at it.
 */
function step(b, dt) {
  const prevX = b.x;
  const prevY = b.y;

  b.vy += BALL_GRAVITY * dt;
  b.vx += b.spin * 12 * dt;
  b.spin *= Math.pow(0.2, dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x - BALL_R < 0) {
    b.x = BALL_R;
    b.vx = Math.abs(b.vx) * 0.95;
  }
  if (b.x + BALL_R > W) {
    b.x = W - BALL_R;
    b.vx = -Math.abs(b.vx) * 0.95;
  }

  // Net: a swept side-crossing test first (a fast ball can pass clean through
  // the post in one step), then the rounded-corner case over the top.
  const netCX = W / 2;
  const inPostHeight =
    Math.min(b.y, prevY) + BALL_R > NET.top && Math.max(b.y, prevY) - BALL_R < FLOOR_Y;
  if (inPostHeight && (prevX < netCX) !== (b.x < netCX)) {
    if (prevX < netCX) {
      b.x = NET.x - BALL_R;
      b.vx = -Math.abs(b.vx) * NET_BOUNCE;
    } else {
      b.x = NET.x + NET.w + BALL_R;
      b.vx = Math.abs(b.vx) * NET_BOUNCE;
    }
    b.spin *= 0.4;
    return b;
  }

  const nearestX = Math.max(NET.x, Math.min(b.x, NET.x + NET.w));
  const nearestY = Math.max(NET.top, Math.min(b.y, FLOOR_Y));
  const dx = b.x - nearestX;
  const dy = b.y - nearestY;
  const dist = Math.hypot(dx, dy) || 0.01;
  if (dist <= BALL_R) {
    const nX = dx / dist;
    const nY = dy / dist;
    const vn = b.vx * nX + b.vy * nY;
    b.x += nX * (BALL_R - dist);
    b.y += nY * (BALL_R - dist);
    if (vn < 0) {
      b.vx -= (1 + NET_BOUNCE) * vn * nX;
      b.vy -= (1 + NET_BOUNCE) * vn * nY;
    }
  }
  return b;
}

/**
 * Where and when the ball next falls past `hitY`, and where it would land.
 *
 * @returns {{hitX: number, hitT: number, landX: number, landT: number,
 *            crossesNet: boolean, endsMySide: boolean}}
 */
function predict(ball, hitY, seconds, mySide) {
  const b = snapshotBall(ball);
  const steps = Math.ceil(seconds / PHYSICS_STEP);
  const mine = (x) => (x < W / 2 ? -1 : 1) === mySide;

  let hitX = b.x;
  let hitT = Infinity;
  let crossesNet = false;
  const startedMine = mine(b.x);

  for (let i = 1; i <= steps; i++) {
    const wasMine = mine(b.x);
    step(b, PHYSICS_STEP);
    if (mine(b.x) !== wasMine) crossesNet = true;

    if (hitT === Infinity && b.vy > 0 && b.y >= hitY) {
      hitX = b.x;
      hitT = i * PHYSICS_STEP;
    }
    if (b.y + BALL_R >= FLOOR_Y) {
      return {
        hitX: hitT === Infinity ? b.x : hitX,
        hitT: hitT === Infinity ? i * PHYSICS_STEP : hitT,
        landX: b.x,
        landT: i * PHYSICS_STEP,
        crossesNet,
        endsMySide: mine(b.x),
      };
    }
  }
  return {
    hitX: hitT === Infinity ? b.x : hitX,
    hitT: hitT === Infinity ? seconds : hitT,
    landX: b.x,
    landT: seconds,
    crossesNet,
    endsMySide: startedMine && !crossesNet ? true : mine(b.x),
  };
}

/**
 * What would happen if the orb sweep started right now.
 *
 * `smashBall` fires the ball along the orb→ball normal, so *where in the sweep*
 * contact lands is the entire shot: the orb travels 11 o'clock (up and behind)
 * through 12 (straight up) to 3 (level, forward), and connecting near the top
 * of that arc sends the ball almost vertically — a free return for the
 * opponent, and the reason a naively-timed bot rallies forever.
 *
 * So rather than guess at a timing window, this runs both the ball and the orb
 * forward together and reports the actual contact, if any. Mirrors
 * `positionOrb` and `smashBall` in the engine.
 *
 * @returns {{nx: number, ny: number, t: number}|null} outgoing unit direction
 */
function smashOutcome(ball, me, spec) {
  const b = snapshotBall(ball);
  const enemyDir = -me.side;
  const cx = me.x + me.w / 2;
  const cy = me.y + 30;
  const reach = BALL_R + spec.hitR;
  const steps = Math.ceil(spec.windup / PHYSICS_STEP);

  for (let i = 1; i <= steps; i++) {
    step(b, PHYSICS_STEP);
    if (b.y + BALL_R >= FLOOR_Y) return null;

    const prog = (i * PHYSICS_STEP) / spec.windup;
    const hour = spec.startHour + (spec.endHour - spec.startHour) * prog;
    const a = ((((hour % 12) + 12) % 12) * Math.PI) / 6;
    const ox = cx + Math.sin(a) * enemyDir * spec.orbitR;
    const oy = cy - Math.cos(a) * spec.orbitR;

    let nx = b.x - ox;
    let ny = b.y - oy;
    const d = Math.hypot(nx, ny);
    if (d > reach) continue;
    if (d < 0.001) return { nx: enemyDir, ny: 0, t: i * PHYSICS_STEP };
    nx /= d;
    ny /= d;
    if (nx * enemyDir < 0) nx = -nx; // the engine forces the shot downfield
    return { nx, ny, t: i * PHYSICS_STEP };
  }
  return null;
}

/** The x range this robot's centre can occupy — it can never cross the net. */
function courtBounds(r) {
  const half = r.w / 2;
  return r.side < 0
    ? { min: 6 + half, max: NET.x - COURT_GAP - ARM_OVERHANG - r.w + half }
    : { min: NET.x + NET.w + COURT_GAP + ARM_OVERHANG + half, max: W - r.w - 6 + half };
}

/**
 * Charge needed to serve into `targetX`, found by simulating the serve the
 * engine would actually produce. Charge is the only degree of freedom (the
 * launch direction is fixed), so this is a scan over the useful range.
 */
function chargeForTarget(fromX, fromY, servingSide, targetX) {
  let best = 0.55;
  let bestErr = Infinity;
  for (let c = SERVE_CHARGE_FLOOR; c <= 1.0001; c += 0.02) {
    const speed = SERVE_MIN_SPEED + (SERVE_MAX_SPEED - SERVE_MIN_SPEED) * c;
    const b = {
      x: fromX,
      y: fromY,
      vx: speed * SERVE_DIR_X * -servingSide,
      vy: speed * SERVE_DIR_Y,
      spin: 0,
    };
    let landX = null;
    for (let i = 0; i < 700; i++) {
      step(b, PHYSICS_STEP);
      if (b.y + BALL_R >= FLOOR_Y) {
        landX = b.x;
        break;
      }
    }
    if (landX == null) continue;
    // A serve that comes back to our own half is a fault in all but name.
    const ownHalf = (landX < W / 2 ? -1 : 1) === servingSide;
    const err = Math.abs(landX - targetX) + (ownHalf ? 10_000 : 0);
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  return best;
}

/**
 * @param {object} opts
 * @param {object} opts.skill one of SKILLS
 * @param {() => number} opts.random injectable RNG so a bot's quirks are its own
 */
export function createBrain({ skill = SKILLS.normal, random = Math.random } = {}) {
  /** Rolling history of ball states, so we can act on a delayed view of it. */
  const history = [];
  /** Per-rally decisions, so a bot doesn't re-roll its intent every frame. */
  let rallyKey = null;
  let aimBias = 0;
  let smashThisRally = true;
  let serveHoldUntil = 0;
  let servePlanned = false;
  /** Latched jump decision — see the comment where it is set. */
  let jumpChanceOpen = false;
  let jumpCommitted = false;

  function rememberBall(ball, now) {
    history.push({ t: now, ...snapshotBall(ball) });
    // Keep a little more than the largest reaction we might use.
    while (history.length > 2 && now - history[0].t > 600) history.shift();
  }

  /** The ball as this bot currently perceives it — `reactionMs` in the past. */
  function perceived(ball, now) {
    if (!skill.reactionMs) return ball;
    const target = now - skill.reactionMs;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].t <= target) return history[i];
    }
    return history[0] ?? ball;
  }

  /**
   * @param {object} world live engine state
   * @param {number} now performance.now()
   * @returns {{moveDir: -1|0|1, jumpHeld: boolean, attackHeld: boolean, serveHeld: boolean}}
   */
  function think(world, now) {
    const { ball, me, phase, servingSide, mySeat, rallyKey: currentRally } = world;
    const idle = { moveDir: 0, jumpHeld: false, attackHeld: false, serveHeld: false };
    if (!me) return idle;

    rememberBall(ball, now);

    // One set of quirks per rally: which way this bot leans when it returns,
    // and whether it goes for the smash at all. Re-rolled per rally so it does
    // not become predictable, but stable *within* one so it doesn't dither.
    if (currentRally !== rallyKey) {
      rallyKey = currentRally;
      aimBias = (random() * 2 - 1) * skill.aimErrorPx;
      smashThisRally = random() < skill.smashChance;
      servePlanned = false;
    }

    const bounds = courtBounds(me);
    const centre = me.x + me.w / 2;
    const home = me.side < 0 ? W * 0.28 : W * 0.72;

    // ---------------------------------------------------------------- serving
    if (phase === "serve") {
      const iServe = (servingSide < 0 ? 0 : 1) === mySeat;
      if (!iServe) {
        // Stand where a serve most often lands rather than dead centre.
        const wait = me.side < 0 ? W * 0.3 : W * 0.7;
        return { ...idle, moveDir: approach(centre, wait, 14) };
      }
      if (!servePlanned) {
        servePlanned = true;
        // Aim deep into the far corner, softened by skill.
        const deep = me.side < 0 ? W * 0.86 : W * 0.14;
        const target = deep + (random() * 2 - 1) * skill.serveErrorPx;
        const charge = chargeForTarget(ball.x, ball.y, servingSide, target);
        // The engine starts the charge at SERVE_CHARGE_FLOOR on key-down and
        // ramps at 1/SERVE_CHARGE_TIME per second.
        const holdMs = Math.max(0, (charge - SERVE_CHARGE_FLOOR) * SERVE_CHARGE_TIME * 1000);
        serveHoldUntil = now + holdMs;
      }
      return { ...idle, serveHeld: now < serveHoldUntil };
    }

    if (phase !== "play" || !ball.live) {
      return { ...idle, moveDir: approach(centre, home, 16) };
    }

    // ------------------------------------------------------------- rally play
    const view = perceived(ball, now);
    // Contact happens when the ball's edge meets the head, not when its centre
    // reaches head height — a whole ball radius earlier.
    const hitY = me.y - BALL_R + 6;
    const p = predict(view, hitY, skill.predictSeconds, me.side);

    // Is this ball my problem? Either it is already heading here, or it is on
    // my half and not leaving.
    const towardMe = (view.vx < 0 ? -1 : 1) === me.side;
    const onMyHalf = (view.x < W / 2 ? -1 : 1) === me.side;
    const mine = p.endsMySide || (onMyHalf && !p.crossesNet) || (towardMe && p.crossesNet);

    let targetX = home;
    if (mine) {
      // Stand fractionally on the far side of the ball from the net, so the
      // off-centre head contact sends it back over instead of straight up.
      targetX = p.hitX + 14 * me.side + aimBias;
      // A weaker bot simply doesn't commit to the full distance.
      if (skill.coverage < 1) {
        targetX = centre + (targetX - centre) * skill.coverage;
      }
    }
    targetX = Math.max(bounds.min, Math.min(bounds.max, targetX));

    const moveDir = approach(centre, targetX, 8);

    // Jump when the ball is arriving above comfortable standing reach and we
    // are already roughly under it — jumping while out of position just means
    // being out of position in the air.
    const dx = Math.abs(view.x - centre);
    const arriving = p.hitT < 0.45;
    const highBall = view.y < me.y - 40;
    const canJump = mine && me.onGround && arriving && dx < 70 && highBall && view.vy > -60;

    // Roll the dice once per opportunity, not once per frame. Rolling every
    // frame makes the key flicker at frame rate, and as the guest every flip
    // is an input packet — sixty a second instead of a handful per rally.
    if (canJump && !jumpChanceOpen) jumpCommitted = random() < skill.jumpChance;
    jumpChanceOpen = canJump;
    const jumpHeld = canJump && jumpCommitted;

    // Swing only when the swing would actually land, and only when it lands as
    // a shot worth playing. Two purely defensive players rally forever — the
    // ball just keeps bouncing off their heads — so a smash that connects and
    // drives downward is what ends points and keeps matches a sane length.
    const spec = ARM_TYPES[me.armType] ?? ARM_TYPES.hand;
    const canSwing =
      mine && smashThisRally && me.attackCooldown <= 0 && !me.attack &&
      onMyHalf && spec.kind === "orb";
    const shot = canSwing ? smashOutcome(view, me, spec) : null;
    // ny is the outgoing vertical direction: negative is upward. Anything
    // steeper than this is a lob that hands the rally straight back.
    const attackHeld = !!shot && shot.ny > -0.5;

    return { moveDir, jumpHeld, attackHeld, serveHeld: false };
  }

  return { think };
}

/** -1/0/+1 toward `target`, with a deadzone so the bot doesn't jitter in place. */
function approach(from, target, deadzone) {
  const diff = target - from;
  if (Math.abs(diff) < deadzone) return 0;
  return diff > 0 ? 1 : -1;
}

/** Resolve a `--skill` argument, including "mixed" spread across a fleet. */
export function resolveSkill(name, index = 0) {
  if (name === "mixed" || !name) {
    const ladder = ["easy", "normal", "normal", "hard"];
    return { name: ladder[index % ladder.length], skill: SKILLS[ladder[index % ladder.length]] };
  }
  const skill = SKILLS[name];
  if (!skill) throw new Error(`unknown skill "${name}" (want ${SKILL_NAMES.join("|")}|mixed)`);
  return { name, skill };
}

export { ROBOT_H };
