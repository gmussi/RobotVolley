/**
 * WebSocket client for Cloudflare matchmaking + signaling relay.
 */
import { MM, encode, decode } from "./protocol.js";
import { ensureSessionToken, invalidateSessionToken } from "./api.js";
import { matchmakingUrl, tokenProvider } from "./config.js";

export function createMatchmakingClient(handlers = {}, url = null) {
  let ws = null;
  let playerId = null;
  let account = null;
  let closedByUser = false;
  // Guards the invalid_token retry below to exactly one attempt per socket,
  // so a token that is rejected twice in a row (dead refresh token, banned
  // account, etc.) surfaces as a real error instead of looping forever.
  let authRetried = false;

  function emit(name, data) {
    const fn = handlers[name];
    if (typeof fn === "function") fn(data);
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(encode(msg));
  }

  // Resolved at connect time, not import time, so configureNet() can set it.
  const resolveUrl = () => url || matchmakingUrl();

  // Authenticate before anything else — the server refuses to queue an
  // anonymous socket. `open` is emitted only once we're allowed to act, so
  // callers never have to think about the handshake.
  async function sendAuth() {
    const token = await (tokenProvider() ?? ensureSessionToken)();
    if (!token) {
      emit("error", { message: "sign_in_failed" });
      return;
    }
    send({ type: MM.AUTH, token });
  }

  function connect() {
    const target = resolveUrl();
    if (!target) {
      emit("error", { message: "missing_matchmaking_url" });
      return;
    }
    closedByUser = false;
    authRetried = false;
    ws = new WebSocket(target);
    ws.addEventListener("open", () => {
      void sendAuth();
    });
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
        case MM.AUTHED:
          account = { accountId: msg.accountId, displayName: msg.displayName };
          emit("authed", msg);
          // Deferred from the socket's open event: this is the real "ready".
          emit("open");
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
        case MM.RESULT_RECORDED:
          emit("result_recorded", msg);
          break;
        case MM.ERROR:
          // A cached JWT can go stale between logging in and actually queuing
          // (long menu idle, a long prior match) or die mid-session for any
          // other reason. Without this the client keeps re-sending the same
          // dead token on every future connect — including right after the
          // player cancels and tries again — and never recovers on its own.
          // One retry with a forced-fresh token covers that; a caller-supplied
          // tokenProvider owns its own refresh, so it's left alone.
          if (msg.message === "invalid_token" && !authRetried && !tokenProvider()) {
            authRetried = true;
            invalidateSessionToken();
            void sendAuth();
            break;
          }
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

  function reportResult(result) {
    send({ type: MM.MATCH_RESULT, ...result });
  }

  function matchStarted(roomId) {
    send({ type: MM.MATCH_STARTED, roomId });
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
    reportResult,
    matchStarted,
    close,
    getPlayerId: () => playerId,
    getAccount: () => account,
    getUrl: () => resolveUrl(),
  };
}
