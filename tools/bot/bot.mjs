/**
 * One matchmaking bot: a headless player that queues, plays a real online
 * match, reports the result, and queues again — forever.
 *
 * It runs the *shipping* netcode. `src/net/session.js` and `src/engine/game.js`
 * are imported unmodified, which is the whole point: a bot that spoke its own
 * dialect of the protocol would drift out of sync with the game and would be
 * worthless as a load test. The only substitutions are the two browser APIs
 * Node lacks (WebSocket, WebRTC) and the credential source.
 *
 * One bot per process, because the engine is a module-level singleton — there
 * is exactly one ball and one pair of robots per module instance. `run.mjs`
 * forks as many as you ask for.
 *
 * Run via `npm run bots`; see docs/bots.md.
 */
import process from "node:process";
import WebSocket from "ws";
import * as wrtc from "node-datachannel/polyfill";

import { createBotAuth, apiBaseFrom } from "./auth.mjs";
import { createBrain, resolveSkill } from "./brain.mjs";

// ---------------------------------------------------------------- environment

const label = process.env.BOT_LABEL || "bot-0";
const mmUrl = process.env.BOT_MM_URL || "";
const botSecret = process.env.BOT_SECRET || "";
const skillArg = process.env.BOT_SKILL || "mixed";
const skillIndex = Number(process.env.BOT_INDEX || 0);
const idleMinMs = Number(process.env.BOT_IDLE_MIN_MS || 4000);
const idleMaxMs = Number(process.env.BOT_IDLE_MAX_MS || 12000);
/**
 * Abandon a match that has run absurdly long.
 *
 * Two evenly matched players rally for a very long time in this game — the
 * shipped CPU playing itself has a ~4 minute median and a long tail — so this
 * is not a normal outcome, it is the backstop that stops one pathological
 * rally from consuming a bot (and its half of the queue) indefinitely.
 */
const matchTimeoutMs = Number(process.env.BOT_MATCH_TIMEOUT_MS || 8 * 60_000);
const apiBase = apiBaseFrom(mmUrl, process.env.BOT_API_URL);

if (!mmUrl) {
  console.error("BOT_MM_URL is required");
  process.exit(2);
}

/** One JSON object per line — `run.mjs` parses these into the fleet summary. */
function log(ev, data = {}) {
  process.stdout.write(`${JSON.stringify({ t: Date.now(), bot: label, ev, ...data })}\n`);
}

// Node has neither of these. libdatachannel's polyfill is spec-shaped, so the
// unmodified webrtc.js works against it untouched.
globalThis.WebSocket = WebSocket;
globalThis.RTCPeerConnection = wrtc.RTCPeerConnection;
globalThis.RTCSessionDescription = wrtc.RTCSessionDescription;
globalThis.RTCIceCandidate = wrtc.RTCIceCandidate;

// Imported only now, so the globals above are in place before any module that
// closes over them is evaluated.
const { configureNet } = await import("../../src/net/config.js");
const game = await import("../../src/engine/game.js");
const { beginOnlineMatchmaking, cancelOnline, tickOnline, onOnlineEvent, isOnlineActive } =
  await import("../../src/net/session.js");
const { CONTROL, codeFor } = await import("../../src/data/controls.js");

const auth = createBotAuth({ label, apiBase, botSecret, log });
configureNet({ matchmakingUrl: mmUrl, getToken: auth.getToken });

const { name: skillName, skill } = resolveSkill(skillArg, skillIndex);
const brain = createBrain({ skill });

// -------------------------------------------------------------- input surface

/**
 * The engine reads a Set of KeyboardEvent codes, so that is what the bot
 * produces — it goes down the identical path as a human's keyboard rather than
 * writing to the robot directly, which keeps it honest about what a client can
 * actually do.
 */
const keys = new Set();
const KEY = {
  left: codeFor(0, "left"),
  right: codeFor(0, "right"),
  jump: codeFor(0, "jump"),
  attack: codeFor(0, "attack"),
};

function setKey(code, down) {
  const was = keys.has(code);
  if (was === down) return false;
  if (down) keys.add(code);
  else keys.delete(code);
  return true;
}

function applyIntent(intent, phase) {
  setKey(KEY.left, intent.moveDir < 0);
  setKey(KEY.right, intent.moveDir > 0);
  setKey(KEY.jump, intent.jumpHeld);

  // Serve and attack share a key, exactly as they do for a player.
  const attackDown = phase === "serve" ? intent.serveHeld : intent.attackHeld;
  if (setKey(KEY.attack, attackDown)) {
    // Charging a serve is edge-driven, not polled. As host these calls do the
    // work; as guest they early-return and session.js relays the edge instead.
    if (attackDown) game.handleServeKeyDown(KEY.attack, CONTROL);
    else game.handleServeKeyUp(KEY.attack, CONTROL);
  }
}

function releaseAllKeys() {
  for (const code of [...keys]) setKey(code, false);
}

// ------------------------------------------------------------------ lifecycle

const stats = { matches: 0, wins: 0, losses: 0, queuedAt: 0, errors: 0 };
let closing = false;
let requeueTimer = null;
let endedAt = 0;
let reportedEnd = false;
let backoffMs = 1000;
let matchStartedAt = 0;

/** Give the result report and its acknowledgement time to land before leaving. */
const RESULT_GRACE_MS = 2500;

function idleDelay() {
  const lo = Math.min(idleMinMs, idleMaxMs);
  const hi = Math.max(idleMinMs, idleMaxMs);
  return lo + Math.random() * (hi - lo);
}

function requeue(delayMs, reason) {
  if (requeueTimer || closing) return;
  releaseAllKeys();
  endedAt = 0;
  reportedEnd = false;
  matchStartedAt = 0;
  requeueTimer = setTimeout(() => {
    requeueTimer = null;
    stats.queuedAt = Date.now();
    log("queueing", { reason });
    try {
      beginOnlineMatchmaking();
    } catch (err) {
      stats.errors++;
      log("error", { where: "beginOnlineMatchmaking", message: String(err?.message ?? err) });
      requeue(Math.min(backoffMs *= 2, 60_000), "retry");
    }
  }, delayMs);
}

onOnlineEvent((event, data) => {
  switch (event) {
    case "match_started":
      backoffMs = 1000;
      matchStartedAt = Date.now();
      log("match_start", {
        seat: data?.seat,
        host: !!data?.isHost,
        opponent: data?.opponentName ?? null,
        waitedMs: stats.queuedAt ? Date.now() - stats.queuedAt : null,
      });
      break;
    case "result_recorded":
      log("result", { status: data?.status ?? null });
      break;
    case "forfeit_win":
      log("forfeit_win");
      break;
    case "requeue":
      log("requeue_after_failed_connect");
      stats.queuedAt = Date.now();
      break;
    case "disconnect":
    case "cancelled":
      log(event === "disconnect" ? "disconnected" : "cancelled");
      requeue(backoffMs, event);
      backoffMs = Math.min(backoffMs * 2, 60_000);
      break;
    case "error":
      stats.errors++;
      log("error", { message: data?.message ?? "unknown" });
      // Nothing this bot can fix — back off rather than hammer the server.
      if (data?.message === "sign_in_failed" || data?.message === "unauthenticated") {
        requeue(Math.min((backoffMs *= 2), 60_000), "auth");
      }
      break;
    default:
      break;
  }
});

// ------------------------------------------------------------------- the loop

/**
 * Mirrors the browser's frame in `src/main.js`: sample input, run the netcode,
 * then advance physics on a fixed accumulator. Only the render half is absent.
 */
const FRAME_MS = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame() {
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  const phase = game.state;
  const playing = isOnlineActive();

  if (playing && (phase === "play" || phase === "serve")) {
    const me = game.robots[game.onlineLocalSeat];
    const intent = brain.think(
      {
        ball: game.ball,
        me,
        phase,
        servingSide: game.servingSide,
        mySeat: game.onlineLocalSeat,
        // Score only changes between rallies, which makes it a free rally id.
        rallyKey: `${game.score[0]}-${game.score[1]}-${game.servingSide}`,
      },
      now,
    );
    applyIntent(intent, phase);
  } else if (keys.size) {
    releaseAllKeys();
  }

  game.readInput(keys, CONTROL);
  const { runSim } = tickOnline(now, keys, dt);
  if (runSim) game.tickServe(dt);

  // The engine queues sound effects for the browser to drain; nothing here
  // consumes them, so drop them or they grow without bound.
  game.audioEvents.length = 0;

  if (runSim) {
    acc += dt;
    while (acc >= game.PHYSICS_STEP) {
      game.tickPhysics();
      acc -= game.PHYSICS_STEP;
    }
  } else {
    acc = 0;
  }

  // Backstop: a rally that will not end must not hold this bot forever.
  if (matchStartedAt && !requeueTimer && Date.now() - matchStartedAt > matchTimeoutMs) {
    log("match_abandoned", {
      afterMs: Date.now() - matchStartedAt,
      score: [game.score[0], game.score[1]],
    });
    requeue(idleDelay(), "match_timeout");
    cancelOnline();
    return;
  }

  // The match is decided. Keep ticking briefly so session.js can report the
  // result and hear back, then go around again.
  if (game.state === "over") {
    if (!endedAt) endedAt = now;
    if (!reportedEnd) {
      reportedEnd = true;
      stats.matches++;
      const won = game.winner === game.onlineLocalSeat;
      if (won) stats.wins++;
      else stats.losses++;
      log("match_end", { won, score: [game.score[0], game.score[1]] });
    }
    if (now - endedAt > RESULT_GRACE_MS && !requeueTimer) {
      // Schedule first: cancelOnline emits "cancelled", and the handler's
      // requeue then no-ops instead of racing this one.
      requeue(idleDelay(), "match_over");
      cancelOnline();
    }
  }
}

const loop = setInterval(frame, FRAME_MS);

// ------------------------------------------------------------------- shutdown

function shutdown(signal) {
  if (closing) return;
  closing = true;
  clearInterval(loop);
  if (requeueTimer) clearTimeout(requeueTimer);
  log("shutdown", { signal, ...stats });
  try {
    // Leaves the queue and closes the socket, so the server doesn't have to
    // discover this bot is gone by timeout.
    cancelOnline();
  } catch {
    /* ignore */
  }
  try {
    wrtc.cleanup?.();
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  stats.errors++;
  log("error", { where: "unhandledRejection", message: String(err?.message ?? err) });
});

log("start", { skill: skillName, url: mmUrl, api: apiBase });
requeue(0, "startup");
