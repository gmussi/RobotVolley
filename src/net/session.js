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
  applyRemoteInput, applyRemoteServe, readLocalOnlineInput,
  onlineIsHost, onlineLocalSeat, state, servingSide,
} from "../engine/game.js";
import { codeFor } from "../data/controls.js";

const SNAPSHOT_INTERVAL_MS = 40;

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

function cleanupNet(keepUi = false) {
  active = false;
  channelReady = false;
  matchInfo = null;
  pendingLoadout = null;
  remoteInput = null;
  serveKeyDown = false;
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
  if (!keepUi) {
    /* caller handles UI */
  }
}

export function cancelOnline() {
  cleanupNet(true);
  toMenu();
  notify("cancelled");
}

export function beginOnlineMatchmaking() {
  cleanupNet(true);
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
        cleanupNet(true);
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
        cleanupNet(true);
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
      peer.send({
        type: DC.HELLO,
        seat: msg.seat,
        localLoadout: capturePreMatchLoadout(msg.seat),
      });
    },
    onClose: () => {
      if (!active && !matchInfo) return;
      const wasActive = active;
      cleanupNet(true);
      if (wasActive || state === "searching") {
        showDisconnect("Opponent disconnected");
        notify("disconnect");
      }
    },
  });

  if (msg.isHost) {
    // Slight delay so guest's ondatachannel is ready.
    setTimeout(() => peer?.startHostOffer(), 50);
  }
}

/** Prefer lab customization on the seat the player will occupy. */
function capturePreMatchLoadout(seat) {
  // Before startGame, robots hold menu customization (P1 left / P2 right).
  return getRobotLoadout(seat);
}

function onChannelMessage(msg) {
  if (!msg || !matchInfo) return;

  if (msg.type === DC.HELLO) {
    pendingLoadout = msg.localLoadout || null;
    // Host starts as soon as the guest hello arrives (loadout exchange).
    if (matchInfo.isHost) beginMatch();
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
    // Guest enters the match on the first authoritative snapshot.
    if (!active) beginMatch();
    applySnapshot(msg.snapshot);
    notify("snapshot", msg.snapshot);
  }
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
  setOnlineStatus("");
  notify("match_started", matchInfo);

  // Host pushes an immediate snapshot so guest syncs.
  if (matchInfo.isHost) {
    peer?.send({ type: DC.STATE, snapshot: buildSnapshot(tickCounter) });
  }
}

/**
 * Per-frame online netcode. Call from the main loop.
 * @returns {{ runSim: boolean }} whether local physics should advance
 */
export function tickOnline(now, keys) {
  if (!active || !matchInfo || !channelReady) {
    return { runSim: false };
  }

  const input = readLocalOnlineInput(keys);

  if (matchInfo.isHost) {
    if (remoteInput) applyRemoteInput(remoteInput);
    // Local seat input already applied by readInput in main.
    if (now - lastSnapAt >= SNAPSHOT_INTERVAL_MS) {
      tickCounter++;
      peer?.send({ type: DC.STATE, snapshot: buildSnapshot(tickCounter) });
      lastSnapAt = now;
    }
    return { runSim: true };
  }

  // Guest: send inputs + serve edges; do not simulate.
  peer?.send({ type: DC.INPUT, input });

  const serveCode = codeFor(0, "serve");
  const down = keys.has(serveCode);
  const serverSeat = servingSide < 0 ? 0 : 1;
  if (serverSeat === onlineLocalSeat) {
    if (down && !serveKeyDown) {
      peer?.send({ type: DC.SERVE, action: "down" });
    } else if (!down && serveKeyDown) {
      peer?.send({ type: DC.SERVE, action: "up" });
    }
  }
  serveKeyDown = down;

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
  };
}
