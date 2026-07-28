/**
 * Global matchmaking queue + WebRTC signaling relay (Durable Object).
 *
 * Sockets authenticate with the session JWT before they may queue. That costs
 * no availability — the account API and this matchmaker are the same Worker, so
 * if one is reachable the other is too — and it buys two things: results can be
 * attributed to an account, and display names are vouched for by the server
 * instead of claimed by the peer (otherwise any modified client could
 * impersonate anyone by lying in its DataChannel handshake).
 */
import { verifyJwt } from "./auth/jwt.js";
import { getAccount, getStats } from "./db.js";
import { START_ELO } from "../../shared/ranking.js";
import { planPairings, HUMAN_BOT_GRACE_MS } from "../../shared/pairing.js";
import { reportResult, recordForfeit } from "./results.js";

/**
 * How long a finished room's seat→account mapping is kept so a late result
 * report can still be attributed. Persisted in DO storage rather than memory:
 * the object can be evicted between the last snapshot and the report.
 */
const ROOM_RETENTION_MS = 5 * 60 * 1000;

/**
 * Pairing is partly time-based — a human waits `HUMAN_BOT_GRACE_MS` before a
 * bot becomes an acceptable opponent — so it cannot only run when someone
 * joins. This is how often we re-check while anyone is queued.
 */
const PAIRING_SWEEP_MS = 1000;

function parseGeo(headers) {
  const lat = parseFloat(headers.get("X-Geo-Lat") || "");
  const lon = parseFloat(headers.get("X-Geo-Lon") || "");
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    colo: headers.get("X-Geo-Colo") || "",
    country: headers.get("X-Geo-Country") || "",
  };
}

function randomId() {
  return crypto.randomUUID();
}

function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

function isOpen(ws) {
  return !!ws && ws.readyState === 1;
}

export class Matchmaker {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    /** @type {Map<string, { ws: WebSocket, accountId: string|null, displayName: string|null, lat: number|null, lon: number|null, colo: string, country: string, inQueue: boolean, roomId: string|null, peerId: string|null, joinedAt: number }>} */
    this.sessions = new Map();
    /** @type {string[]} */
    this.queue = [];
    /** @type {Map<string, { a: string, b: string }>} */
    this.rooms = new Map();
    /** Handle for the pairing sweep; non-null only while the queue is busy. */
    this.sweepTimer = null;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const geo = parseGeo(request.headers);
    this.acceptSession(server, geo);
    return new Response(null, { status: 101, webSocket: client });
  }

  acceptSession(ws, geo) {
    ws.accept();
    const playerId = randomId();
    const session = {
      ws,
      // Filled in by the `auth` frame; until then the socket may only sign in.
      accountId: null,
      displayName: null,
      lat: geo.lat,
      lon: geo.lon,
      colo: geo.colo,
      country: geo.country,
      isBot: false,
      inQueue: false,
      roomId: null,
      peerId: null,
      joinedAt: Date.now(),
      /** When this socket last entered the queue — drives the bot grace period. */
      queuedAt: 0,
    };
    this.sessions.set(playerId, session);

    this.send(ws, {
      type: "hello",
      playerId,
      geo: { colo: geo.colo, country: geo.country },
    });

    ws.addEventListener("message", (event) => {
      this.onMessage(playerId, event.data);
    });
    ws.addEventListener("close", () => {
      this.onClose(playerId);
    });
    ws.addEventListener("error", () => {
      this.onClose(playerId);
    });
  }

  send(ws, msg) {
    try {
      if (isOpen(ws)) ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  sendTo(playerId, msg) {
    const s = this.sessions.get(playerId);
    if (s) this.send(s.ws, msg);
  }

  isAlive(playerId) {
    const s = this.sessions.get(playerId);
    return !!(s && isOpen(s.ws));
  }

  /** Drop closed sockets and stale queue ids so clients never match ghosts. */
  pruneDead() {
    for (const [id, s] of [...this.sessions.entries()]) {
      if (!isOpen(s.ws)) this.onClose(id);
    }
    this.queue = this.queue.filter((id) => {
      const s = this.sessions.get(id);
      return !!(s && s.inQueue && !s.roomId && isOpen(s.ws));
    });
  }

  onMessage(playerId, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      this.sendTo(playerId, { type: "error", message: "invalid_json" });
      return;
    }

    switch (msg.type) {
      case "auth":
        this.authenticate(playerId, msg.token);
        break;
      case "join_queue":
        this.joinQueue(playerId);
        break;
      case "leave_queue":
        this.leaveQueue(playerId);
        break;
      case "cancel_match":
        this.cancelMatch(playerId);
        break;
      case "signal":
        this.relaySignal(playerId, msg);
        break;
      case "match_result":
        this.recordResult(playerId, msg);
        break;
      case "match_started":
        this.markMatchStarted(playerId, msg.roomId);
        break;
      default:
        this.sendTo(playerId, { type: "error", message: "unknown_type" });
    }
  }

  /**
   * Bind this socket to an account. The client waits for `authed` before it
   * queues, so this races with nothing; a failure leaves the socket usable but
   * unable to queue, and the client surfaces that rather than hanging.
   */
  async authenticate(playerId, token) {
    const s = this.sessions.get(playerId);
    if (!s) return;

    const payload = this.env?.JWT_SIGNING_KEY
      ? await verifyJwt(token, this.env.JWT_SIGNING_KEY)
      : null;
    if (!payload?.sub) {
      this.sendTo(playerId, { type: "error", message: "invalid_token" });
      return;
    }

    const account = await getAccount(this.env.DB, payload.sub);
    if (!account) {
      this.sendTo(playerId, { type: "error", message: "no_account" });
      return;
    }
    if (account.banned) {
      this.sendTo(playerId, { type: "error", message: "banned" });
      return;
    }

    s.accountId = account.id;
    s.displayName = account.display_name;
    // Set by the server from the account row, never claimed by the socket: it
    // decides matchmaking priority (see shared/pairing.js), so a client that
    // could assert it could misrepresent what the queue contains.
    s.isBot = account.is_bot === 1;
    // Cached now so pairing stays synchronous — the queue scan must not await.
    s.elo = (await getStats(this.env.DB, account.id)).elo ?? START_ELO;
    this.sendTo(playerId, {
      type: "authed",
      accountId: account.id,
      displayName: account.display_name,
    });
  }

  /**
   * Persist the seat→account mapping for a room, so a result reported after a
   * peer drops (or after this object is evicted) can still be attributed.
   */
  async rememberRoom(roomId, seats) {
    await this.ctx.storage.put(`room:${roomId}`, { seats, at: Date.now() });
    const existing = await this.ctx.storage.getAlarm();
    if (existing == null) await this.ctx.storage.setAlarm(Date.now() + ROOM_RETENTION_MS);
  }

  /**
   * A peer told us their side of this room reached beginMatch(). Recorded so
   * a later dropped connection (see forfeitIfStarted) can be told apart from
   * a WebRTC handshake that never actually turned into a match — only a room
   * marked started here is eligible to be forfeited into real stats.
   */
  async markMatchStarted(playerId, roomId) {
    const s = this.sessions.get(playerId);
    if (!s || !roomId || s.roomId !== roomId) return;
    const record = await this.ctx.storage.get(`room:${roomId}`);
    if (!record || record.started) return;
    // Refresh `at` so the retention window covers the match's actual length,
    // not just the time between matchmaking and the WebRTC handshake.
    await this.ctx.storage.put(`room:${roomId}`, { ...record, started: true, at: Date.now() });
  }

  /**
   * The room's other player is gone and the match had actually started —
   * credit the one still here a forfeit win. This is server-observed (the
   * socket really closed), not a client claim, so it needs no corroboration
   * from a second report.
   */
  async forfeitIfStarted(roomId, survivorPlayerId, quitterAccountId) {
    const record = await this.ctx.storage.get(`room:${roomId}`);
    if (!record?.started) return;
    const seats = record.seats || [];
    const survivorAccount = seats.find((id) => id && id !== quitterAccountId);
    if (!survivorAccount) return;

    const outcome = await recordForfeit(this.env.DB, {
      roomId,
      seats,
      winnerAccount: survivorAccount,
      loserAccount: quitterAccountId,
    });
    this.sendTo(survivorPlayerId, { type: "result_recorded", status: outcome.status });
  }

  /** Sweep expired room records; re-arm while any remain. */
  async alarm() {
    const rooms = await this.ctx.storage.list({ prefix: "room:" });
    const cutoff = Date.now() - ROOM_RETENTION_MS;
    let remaining = 0;
    for (const [key, value] of rooms) {
      if ((value?.at ?? 0) < cutoff) await this.ctx.storage.delete(key);
      else remaining++;
    }
    if (remaining > 0) await this.ctx.storage.setAlarm(Date.now() + ROOM_RETENTION_MS);
  }

  /**
   * One peer's view of a finished match. The result is only written once both
   * peers agree — see results.js.
   */
  async recordResult(playerId, msg) {
    const s = this.sessions.get(playerId);
    if (!s?.accountId) {
      this.sendTo(playerId, { type: "error", message: "unauthenticated" });
      return;
    }

    const record = await this.ctx.storage.get(`room:${msg.roomId}`);
    if (!record) {
      this.sendTo(playerId, { type: "error", message: "unknown_room" });
      return;
    }
    // Only the two players in that room may report on it.
    const seat = record.seats.indexOf(s.accountId);
    if (seat < 0) {
      this.sendTo(playerId, { type: "error", message: "not_your_match" });
      return;
    }

    const outcome = await reportResult(this.env.DB, {
      roomId: msg.roomId,
      accountId: s.accountId,
      seat,
      seats: record.seats,
      report: {
        winnerSeat: msg.winnerSeat,
        score: msg.score,
        durationMs: msg.durationMs,
      },
    });
    this.sendTo(playerId, { type: "result_recorded", status: outcome.status });
  }

  joinQueue(playerId) {
    this.pruneDead();
    const s = this.sessions.get(playerId);
    if (!s || !isOpen(s.ws)) return;
    if (!s.accountId) {
      this.sendTo(playerId, { type: "error", message: "unauthenticated" });
      return;
    }
    if (s.roomId) {
      // Soft-cancel a failed WebRTC attempt so the player can requeue.
      this.cancelMatch(playerId);
    }
    if (!s.inQueue) {
      s.inQueue = true;
      s.queuedAt = Date.now();
      if (!this.queue.includes(playerId)) this.queue.push(playerId);
    }
    this.sendTo(playerId, { type: "queue_joined" });

    // Everyone in the queue is considered together rather than just this
    // arrival, because who *else* is waiting changes the answer — see
    // shared/pairing.js.
    this.runPairing();
  }

  /**
   * Form every match the current queue allows. Safe to call at any time; it is
   * driven both by arrivals and by a timer, since a human's eligibility for a
   * bot opponent turns on how long they have been waiting.
   */
  runPairing() {
    this.pruneDead();

    const entries = [];
    for (const id of this.queue) {
      const s = this.sessions.get(id);
      if (!s) continue;
      entries.push({
        id,
        isBot: !!s.isBot,
        queuedAt: s.queuedAt || s.joinedAt,
        lat: s.lat,
        lon: s.lon,
        elo: s.elo ?? START_ELO,
      });
    }

    // How many bots to keep sitting in the queue as a standing supply of
    // instant opponents. Tunable per deploy: a fleet that exists to cover
    // players wants a couple held back, one that exists to generate load
    // wants 0. See shared/pairing.js.
    const reserveBots = Number.isFinite(Number(this.env?.BOT_QUEUE_RESERVE))
      ? Number(this.env.BOT_QUEUE_RESERVE)
      : undefined;

    for (const [hostId, guestId] of planPairings(entries, Date.now(), { reserveBots })) {
      if (this.isAlive(hostId) && this.isAlive(guestId)) this.formMatch(hostId, guestId);
    }

    this.scheduleSweep();
  }

  /**
   * Keep re-running pairing while anyone is queued. A human who arrives to an
   * all-bot queue is deliberately not matched for `HUMAN_BOT_GRACE_MS`, and
   * nothing else would wake us up to match them once that expires.
   *
   * The object stays resident for the life of its WebSockets (they are
   * `accept()`ed, not hibernated), so a plain timer is enough here; the storage
   * alarm is left to room retention, which is on a completely different clock.
   */
  scheduleSweep() {
    const busy = this.queue.length > 0;
    if (!busy) {
      if (this.sweepTimer != null) {
        clearTimeout(this.sweepTimer);
        this.sweepTimer = null;
      }
      return;
    }
    if (this.sweepTimer != null) return;
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      try {
        this.runPairing();
      } catch {
        /* never let a sweep failure take the object down */
      }
    }, Math.min(PAIRING_SWEEP_MS, HUMAN_BOT_GRACE_MS));
  }

  leaveQueue(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return;
    s.inQueue = false;
    s.queuedAt = 0;
    this.queue = this.queue.filter((id) => id !== playerId);
  }

  /** Clear a matched pair without closing the WebSocket (WebRTC failed / timeout). */
  cancelMatch(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return;
    const peerId = s.peerId;
    const roomId = s.roomId;
    s.peerId = null;
    s.roomId = null;
    s.inQueue = false;
    if (roomId) this.rooms.delete(roomId);
    if (peerId) {
      const peer = this.sessions.get(peerId);
      if (peer) {
        peer.peerId = null;
        peer.roomId = null;
        peer.inQueue = false;
        this.sendTo(peerId, { type: "peer_left" });
      }
    }
  }

  formMatch(hostId, guestId) {
    const host = this.sessions.get(hostId);
    const guest = this.sessions.get(guestId);
    if (!host || !guest || !isOpen(host.ws) || !isOpen(guest.ws)) {
      // One side died — put the survivor back in queue, with a fresh wait clock
      // so they get another shot at a human before a bot is offered.
      for (const [id, s] of [[hostId, host], [guestId, guest]]) {
        if (!s || !isOpen(s.ws)) continue;
        s.inQueue = true;
        s.queuedAt = Date.now();
        if (!this.queue.includes(id)) this.queue.push(id);
      }
      return;
    }

    this.leaveQueue(hostId);
    this.leaveQueue(guestId);

    const roomId = randomId();
    const matchSeed = randomSeed();
    this.rooms.set(roomId, { a: hostId, b: guestId });
    // Seat order here is the seat order the clients are told below (host = 0).
    void this.rememberRoom(roomId, [host.accountId, guest.accountId]);

    host.inQueue = false;
    guest.inQueue = false;
    host.roomId = roomId;
    guest.roomId = roomId;
    host.peerId = guestId;
    guest.peerId = hostId;

    // Names come from us, not from the peers. A client that lies in its
    // DataChannel handshake cannot make itself appear as someone else.
    this.sendTo(hostId, {
      type: "match_found",
      roomId,
      matchSeed,
      isHost: true,
      seat: 0,
      peerId: guestId,
      localName: host.displayName,
      opponentName: guest.displayName,
    });
    this.sendTo(guestId, {
      type: "match_found",
      roomId,
      matchSeed,
      isHost: false,
      seat: 1,
      peerId: hostId,
      localName: guest.displayName,
      opponentName: host.displayName,
    });
  }

  relaySignal(fromId, msg) {
    const from = this.sessions.get(fromId);
    if (!from || !from.peerId) {
      this.sendTo(fromId, { type: "error", message: "no_peer" });
      return;
    }
    if (!this.isAlive(from.peerId)) {
      this.cancelMatch(fromId);
      this.sendTo(fromId, { type: "peer_left" });
      return;
    }
    const targetId = msg.targetId || from.peerId;
    if (targetId !== from.peerId) {
      this.sendTo(fromId, { type: "error", message: "bad_target" });
      return;
    }
    this.sendTo(targetId, {
      type: "signal",
      fromId,
      payload: msg.payload,
    });
  }

  onClose(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return;

    this.leaveQueue(playerId);

    const { roomId, peerId, accountId } = s;
    if (peerId) {
      const peer = this.sessions.get(peerId);
      if (peer) {
        peer.peerId = null;
        if (peer.roomId) this.rooms.delete(peer.roomId);
        peer.roomId = null;
        this.sendTo(peerId, { type: "peer_left" });
      }
    }
    if (roomId) this.rooms.delete(roomId);
    this.sessions.delete(playerId);

    if (roomId && peerId && accountId) {
      void this.forfeitIfStarted(roomId, peerId, accountId);
    }
  }
}
