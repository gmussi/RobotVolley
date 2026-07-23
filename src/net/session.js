/**
 * Online session orchestration — matchmaking, WebRTC, host/guest roles.
 * Called from main.js only (keeps engine free of network imports).
 */
import { createMatchmakingClient } from "./matchmaking.js";
import { createPeerConnection } from "./webrtc.js";
import { DC } from "./protocol.js";
import {
  enterSearching, showDisconnect, toMenu, startGame, setOnlineStatus,
  getRobotLoadout, applyRobotLoadout, buildSnapshot, applySnapshot,
  applyRemoteInput, applyRemoteServe, readLocalOnlineInput, extrapolateVisual,
  onlineIsHost, onlineLocalSeat, state, servingSide,
} from "../engine/game.js";
import { codeFor } from "../data/controls.js";

/** ~50 Hz snapshots — guest extrapolates between them for smooth render. */
const SNAPSHOT_INTERVAL_MS = 20;

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

function cleanupNet() {
  active = false;
  channelReady = false;
  matchInfo = null;
  pendingLoadout = null;
  remoteInput = null;
  serveKeyDown = false;
  pendingSnap = null;
  lastSnapTick = -1;
  lastSentInput = null;
  try {
    peer?.close();
  } catch {
    /* ignore */
  }
  peer = null;
  try {
    mm?.close();
  } catch {
    /* ignore */
  }
  mm = null;
}

export function cancelOnline() {
  cleanupNet();
  toMenu();
  notify("cancelled");
}

export function beginOnlineMatchmaking() {
  cleanupNet();
  enterSearching();

  if (!import.meta.env.VITE_MATCHMAKING_URL) {
    setOnlineStatus("Online matchmaking is not configured");
    showDisconnect("Set VITE_MATCHMAKING_URL to play online");
    notify("error", { message: "missing_url" });
    return;
  }

  mm = createMatchmakingClient({
    open: () => {
      setOnlineStatus("Searching for opponent…");
      mm.joinQueue();
    },
    queue_joined: () => {
      setOnlineStatus("Searching for opponent…");
    },
    match_found: (msg) => {
      matchInfo = msg;
      setOnlineStatus("Opponent found — connecting…");
      startWebRtc(msg);
    },
    signal: (msg) => {
      peer?.handleSignal(msg.payload);
    },
    peer_left: () => {
      if (active || matchInfo) {
        cleanupNet();
        showDisconnect("Opponent disconnected");
        notify("disconnect");
      }
    },
    error: (msg) => {
      if (msg.message === "missing_matchmaking_url") {
        showDisconnect("Set VITE_MATCHMAKING_URL to play online");
      } else if (state === "searching") {
        setOnlineStatus(`Matchmaking error: ${msg.message || "unknown"}`);
      }
      notify("error", msg);
    },
    close: () => {
      if (state === "searching") {
        showDisconnect("Lost connection to matchmaking server");
        cleanupNet();
        notify("disconnect");
      }
    },
  });
  mm.connect();
}

function startWebRtc(msg) {
  peer = createPeerConnection({
    isHost: msg.isHost,
    onSignal: (payload) => {
      mm?.signal(payload, msg.peerId);
    },
    onMessage: onChannelMessage,
    onOpen: () => {
      channelReady = true;
      setOnlineStatus("Opponent found — syncing…");
      peer.sendCtrl({
        type: DC.HELLO,
        seat: msg.seat,
        localLoadout: capturePreMatchLoadout(msg.seat),
      });
    },
    onClose: () => {
      if (!active && !matchInfo) return;
      const wasActive = active;
      const wasSearching = state === "searching";
      cleanupNet();
      if (wasActive || wasSearching) {
        showDisconnect("Opponent disconnected");
        notify("disconnect");
      }
    },
  });

  if (msg.isHost) {
    // Slight delay so guest's ondatachannel handlers are attached.
    setTimeout(() => peer?.startHostOffer(), 50);
  }
}

/** Prefer lab customization on the seat the player will occupy. */
function capturePreMatchLoadout(seat) {
  return getRobotLoadout(seat);
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
    // Both sides enter the match once peer hello arrives (channels are up).
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
  // Reliable first snapshot so the guest always leaves "connecting".
  peer.sendCtrl({ type: DC.STATE, snapshot: snap });
  peer.sendGame({ type: DC.STATE, snapshot: snap });
}

function beginMatch() {
  if (!matchInfo || active) return;
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
  lastSnapAt = performance.now();
  lastSnapTick = -1;
  lastSentInput = null;
  setOnlineStatus("");
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
  // Guest must be able to drain pendingSnap before `active` flips true.
  if (!matchInfo || !channelReady) {
    return { runSim: false };
  }

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

  const serveCode = codeFor(0, "serve");
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
