/**
 * WebSocket client for Cloudflare matchmaking + signaling relay.
 */
import { MM, encode, decode } from "./protocol.js";

const DEFAULT_URL = import.meta.env.VITE_MATCHMAKING_URL || "";

export function createMatchmakingClient(handlers = {}, url = DEFAULT_URL) {
  let ws = null;
  let playerId = null;
  let closedByUser = false;

  function emit(name, data) {
    const fn = handlers[name];
    if (typeof fn === "function") fn(data);
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
  }

  function connect() {
    if (!url) {
      emit("error", { message: "missing_matchmaking_url" });
      return;
    }
    closedByUser = false;
    ws = new WebSocket(url);
    ws.addEventListener("open", () => emit("open"));
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = decode(ev.data);
      } catch {
        emit("error", { message: "bad_message" });
        return;
      }
      switch (msg.type) {
        case MM.HELLO:
          playerId = msg.playerId;
          emit("hello", msg);
          break;
        case MM.QUEUE_JOINED:
          emit("queue_joined", msg);
          break;
        case MM.MATCH_FOUND:
          emit("match_found", msg);
          break;
        case MM.SIGNAL:
          emit("signal", msg);
          break;
        case MM.PEER_LEFT:
          emit("peer_left", msg);
          break;
        case MM.ERROR:
          emit("error", msg);
          break;
        default:
          break;
      }
    });
    ws.addEventListener("close", () => {
      if (!closedByUser) emit("close");
      ws = null;
    });
    ws.addEventListener("error", () => {
      emit("error", { message: "socket_error" });
    });
  }

  function joinQueue() {
    send({ type: MM.JOIN_QUEUE });
  }

  function leaveQueue() {
    send({ type: MM.LEAVE_QUEUE });
  }

  function cancelMatch() {
    send({ type: MM.CANCEL_MATCH });
  }

  function signal(payload, targetId) {
    send({ type: MM.SIGNAL, payload, targetId });
  }

  function close() {
    closedByUser = true;
    try {
      leaveQueue();
    } catch {
      /* ignore */
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    ws = null;
  }

  return {
    connect,
    joinQueue,
    leaveQueue,
    cancelMatch,
    signal,
    close,
    getPlayerId: () => playerId,
    getUrl: () => url,
  };
}
