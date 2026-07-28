/**
 * Online session orchestration — matchmaking, WebRTC, host/guest roles.
 * Called from main.js only (keeps engine free of network imports).
 */
import { createMatchmakingClient } from "./matchmaking.js";
import { createPeerConnection } from "./webrtc.js";
import { DC } from "./protocol.js";
import { matchmakingUrl } from "./config.js";
import {
  enterSearching, showDisconnect, toMenu, startGame, setOnlineStatus,
  getRobotLoadout, applyRobotLoadout, buildSnapshot, applySnapshot,
  applyRemoteInput, applyRemoteServe, readLocalOnlineInput, extrapolateVisual,
  applyRobotCosmetics, awardForfeitWin, onlineIsHost, onlineLocalSeat, state,
  servingSide, score, winner,
} from "../engine/game.js";
import { codeFor } from "../data/controls.js";
import { getLoadout as getProfileLoadout, refreshAfterMatch } from "../progress/profile.js";

/** ~50 Hz snapshots — guest extrapolates between them for smooth render. */
const SNAPSHOT_INTERVAL_MS = 20;
/** Abort WebRTC if channels never open (e.g. matched a dead queue ghost). */
const CONNECT_TIMEOUT_MS = 12000;

let mm = null;
let peer = null;
let matchInfo = null;
let pendingLoadout = null;
let remoteInput = null;
let tickCounter = 0;
let lastSnapAt = 0;
let active = false;
let serveKeyDown = false;
let channelReady = false;
let connectTimer = null;
/** For the result report: wall-clock match length, and a once-only guard. */
let matchStartedAt = 0;
let resultReported = false;

/** Guest: latest unapplied snapshot (coalesce bursts onto one apply/frame). */
let pendingSnap = null;
let lastSnapTick = -1;
let lastSentInput = null;

const listeners = new Set();

function notify(event, data) {
  for (const fn of listeners) fn(event, data);
}

export function onOnlineEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isOnlineActive() {
  return active;
}

export function isOnlineSearching() {
  return state === "searching";
}

/**
 * Display names for the current match, keyed by seat. These come from
 * `match_found` — i.e. from the server — never from the peer's handshake, so
 * they cannot be spoofed by a modified client.
 * @returns {{0: string, 1: string}|null}
 */
export function getMatchNames() {
  if (!matchInfo) return null;
  const names = { 0: "P1", 1: "P2" };
  names[matchInfo.seat] = matchInfo.localName || "YOU";
  names[matchInfo.seat === 0 ? 1 : 0] = matchInfo.opponentName || "OPPONENT";
  return names;
}

function clearConnectTimer() {
  if (connectTimer != null) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
}

function cleanupPeerOnly() {
  clearConnectTimer();
  channelReady = false;
  // Clear matchInfo before closing so peer onClose does not re-enter requeue.
  matchInfo = null;
  pendingLoadout = null;
  pendingSnap = null;
  lastSnapTick = -1;
  lastSentInput = null;
  remoteInput = null;
  serveKeyDown = false;
  const p = peer;
  peer = null;
  try {
    p?.close();
  } catch {
    /* ignore */
  }
}

function cleanupNet() {
  active = false;
  cleanupPeerOnly();
  try {
    mm?.close();
  } catch {
    /* ignore */
  }
  mm = null;
}

/** WebRTC failed before the match started — stay on matchmaker and search again. */
function failConnectAndRequeue(reason) {
  const wasActive = active;
  active = false;
  cleanupPeerOnly();
  try {
    mm?.cancelMatch();
  } catch {
    /* ignore */
  }
  if (wasActive || !mm) {
    showDisconnect(reason || "online.opponentDisconnected");
    cleanupNet();
    notify("disconnect");
    return;
  }
  enterSearching();
  setOnlineStatus(reason || "online.connectionFailed");
  mm.joinQueue();
  notify("requeue");
}

/**
 * The opponent's connection dropped while a match was in progress. Award the
 * still-connected player the win instead of leaving them stuck on a bare
 * "opponent disconnected" screen with no result — this is the only signal
 * either peer gets that the other one quit or lost their connection.
 */
function handleOpponentGoneMidMatch() {
  const seat = onlineLocalSeat;
  const decided = state === "over" || winner === 0 || winner === 1;
  cleanupNet();
  // A match that already has a result is not a forfeit. Both peers linger on
  // the result screen and whoever leaves first closes their socket; without
  // this guard the one still watching gets "opponent disconnected — you win"
  // pasted over the match they just lost.
  if (decided) return;
  awardForfeitWin(seat);
  notify("forfeit_win");
}

export function cancelOnline() {
  cleanupNet();
  toMenu();
  notify("cancelled");
}

export function beginOnlineMatchmaking() {
  cleanupNet();
  enterSearching();

  if (!matchmakingUrl()) {
    setOnlineStatus("online.notConfigured");
    showDisconnect("online.setUrl");
    notify("error", { message: "missing_url" });
    return;
  }

  mm = createMatchmakingClient({
    open: () => {
      setOnlineStatus("online.searching");
      mm.joinQueue();
    },
    queue_joined: () => {
      setOnlineStatus("online.searching");
    },
    match_found: (msg) => {
      matchInfo = msg;
      setOnlineStatus("online.opponentFound");
      startWebRtc(msg);
    },
    signal: (msg) => {
      peer?.handleSignal(msg.payload);
    },
    result_recorded: (msg) => {
      // Re-read the profile so a cosmetic this win unlocked is selectable
      // immediately, without a restart.
      if (msg.status === "recorded") void refreshAfterMatch();
      notify("result_recorded", msg);
    },
    peer_left: () => {
      if (active) {
        handleOpponentGoneMidMatch();
        return;
      }
      if (matchInfo) {
        failConnectAndRequeue("online.opponentLeft");
      }
    },
    error: (msg) => {
      if (msg.message === "missing_matchmaking_url") {
        showDisconnect("online.setUrl");
      } else if (msg.message === "sign_in_failed" || msg.message === "unauthenticated") {
        showDisconnect("online.signInFailed");
        cleanupNet();
        notify("disconnect");
      } else if (state === "searching") {
        setOnlineStatus("online.matchmakingError", { message: msg.message || "unknown" });
      }
      notify("error", msg);
    },
    close: () => {
      if (state === "searching" || (!active && matchInfo)) {
        showDisconnect("online.lostServer");
        cleanupNet();
        notify("disconnect");
      }
    },
  });
  mm.connect();
}

function startWebRtc(msg) {
  cleanupPeerOnly();
  matchInfo = msg;

  peer = createPeerConnection({
    isHost: msg.isHost,
    onSignal: (payload) => {
      mm?.signal(payload, msg.peerId);
    },
    onMessage: onChannelMessage,
    onOpen: () => {
      clearConnectTimer();
      channelReady = true;
      setOnlineStatus("online.opponentSyncing");
      peer.sendCtrl({
        type: DC.HELLO,
        seat: msg.seat,
        localLoadout: capturePreMatchLoadout(msg.seat),
      });
    },
    onClose: () => {
      if (active) {
        handleOpponentGoneMidMatch();
        return;
      }
      if (matchInfo) {
        failConnectAndRequeue("online.connectFailed");
      }
    },
  });

  connectTimer = setTimeout(() => {
    if (!channelReady && matchInfo) {
      failConnectAndRequeue("online.connectTimeout");
    }
  }, CONNECT_TIMEOUT_MS);

  if (msg.isHost) {
    // Slight delay so guest's ondatachannel handlers are attached.
    setTimeout(() => peer?.startHostOffer(), 80);
  }
}

/**
 * Dress the seat we're about to occupy from the signed-in profile, then hand
 * the cosmetics to the peer. Colors/cosmetics come from the account rather
 * than whatever the Robot Lab last set, so what you picked in the Profile
 * screen is what your opponent sees. Deliberately excludes `accessory` and
 * `weapon` — those are gameplay state, not account cosmetics, and every match
 * must start with no accessory and the default weapon. Sending them here
 * shipped whatever a prior local match (or the Robot Lab) last left on the
 * robot as if it were part of the account loadout.
 */
function capturePreMatchLoadout(seat) {
  applyRobotCosmetics(seat, getProfileLoadout());
  const { colors, cosmetics } = getRobotLoadout(seat);
  return { colors, cosmetics };
}

/**
 * Tell the server who won. Both peers send this independently and the server
 * only records the match when the two agree, so a modified client cannot write
 * its own result — see server/src/results.js.
 */
function reportMatchResult() {
  if (!matchInfo || resultReported) return;
  if (winner !== 0 && winner !== 1) return;
  resultReported = true;
  mm?.reportResult({
    roomId: matchInfo.roomId,
    winnerSeat: winner,
    score: [score[0], score[1]],
    durationMs: Math.round(performance.now() - matchStartedAt),
  });
}

function queueSnapshot(snap) {
  if (!snap || matchInfo?.isHost) return;
  const tick = snap.tick ?? 0;
  if (tick < lastSnapTick) return;
  if (!pendingSnap || tick >= (pendingSnap.tick ?? 0)) {
    pendingSnap = snap;
  }
}

function onChannelMessage(msg) {
  if (!msg || !matchInfo) return;

  if (msg.type === DC.HELLO) {
    pendingLoadout = msg.localLoadout || null;
    beginMatch();
    return;
  }

  if (msg.type === DC.INPUT && matchInfo.isHost) {
    remoteInput = msg.input;
    return;
  }

  if (msg.type === DC.SERVE && matchInfo.isHost) {
    applyRemoteServe(msg.action);
    return;
  }

  if (msg.type === DC.STATE && !matchInfo.isHost) {
    queueSnapshot(msg.snapshot);
  }
}

function sendBootstrapSnapshot() {
  if (!peer || !matchInfo?.isHost) return;
  const snap = buildSnapshot(tickCounter);
  peer.sendCtrl({ type: DC.STATE, snapshot: snap });
  peer.sendGame({ type: DC.STATE, snapshot: snap });
}

function beginMatch() {
  if (!matchInfo || active) return;
  clearConnectTimer();
  const localSeat = matchInfo.seat;
  const myLoadout = capturePreMatchLoadout(localSeat);

  startGame("online", {
    seed: matchInfo.matchSeed,
    localSeat,
    isHost: matchInfo.isHost,
  });

  applyRobotLoadout(localSeat, myLoadout);
  if (pendingLoadout) {
    const remoteSeat = localSeat === 0 ? 1 : 0;
    applyRobotLoadout(remoteSeat, pendingLoadout);
  }

  active = true;
  tickCounter = 0;
  matchStartedAt = performance.now();
  resultReported = false;
  lastSnapAt = performance.now();
  lastSnapTick = -1;
  lastSentInput = null;
  setOnlineStatus("");
  // Tells the server this room is a real, live match — see forfeitIfStarted
  // in the matchmaker, which uses this (not a client's later say-so) to
  // decide whether a dropped connection counts as a forfeit.
  mm?.matchStarted(matchInfo.roomId);
  notify("match_started", matchInfo);

  if (matchInfo.isHost) {
    sendBootstrapSnapshot();
  }
}

function inputChanged(a, b) {
  if (!a || !b) return true;
  return a.moveDir !== b.moveDir || a.jumpHeld !== b.jumpHeld || a.attackHeld !== b.attackHeld;
}

function applyPendingSnapshot() {
  if (!pendingSnap) return;
  const snap = pendingSnap;
  pendingSnap = null;
  if (snap.tick == null || snap.tick >= lastSnapTick) {
    applySnapshot(snap);
    lastSnapTick = snap.tick ?? lastSnapTick;
  }
}

/**
 * Per-frame online netcode. Call from the main loop.
 * @returns {{ runSim: boolean }} whether local physics should advance
 */
export function tickOnline(now, keys, dt = 0) {
  if (!matchInfo || !channelReady) {
    return { runSim: false };
  }

  // Both peers report as soon as the match resolves. Guarded to fire once.
  if (state === "over") reportMatchResult();

  if (!matchInfo.isHost) {
    if (!active && pendingSnap) beginMatch();
    applyPendingSnapshot();
    if (!active) return { runSim: false };
  } else if (!active) {
    return { runSim: false };
  }

  const input = readLocalOnlineInput(keys);

  if (matchInfo.isHost) {
    if (remoteInput) applyRemoteInput(remoteInput);
    if (now - lastSnapAt >= SNAPSHOT_INTERVAL_MS) {
      tickCounter++;
      peer?.sendGame({ type: DC.STATE, snapshot: buildSnapshot(tickCounter) });
      lastSnapAt = now;
    }
    return { runSim: true };
  }

  if (inputChanged(input, lastSentInput)) {
    peer?.sendGame({ type: DC.INPUT, input });
    lastSentInput = input;
  }

  const serveCode = codeFor(0, "attack");
  const down = keys.has(serveCode);
  const serverSeat = servingSide < 0 ? 0 : 1;
  if (serverSeat === onlineLocalSeat) {
    if (down && !serveKeyDown) {
      peer?.sendCtrl({ type: DC.SERVE, action: "down" });
    } else if (!down && serveKeyDown) {
      peer?.sendCtrl({ type: DC.SERVE, action: "up" });
    }
  }
  serveKeyDown = down;

  if (dt > 0) extrapolateVisual(dt);

  return { runSim: false };
}

export function getOnlineDebug() {
  return {
    active,
    channelReady,
    isHost: matchInfo?.isHost,
    seat: matchInfo?.seat,
    onlineIsHost,
    onlineLocalSeat,
    lastSnapTick,
  };
}
