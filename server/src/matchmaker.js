/**
 * Global matchmaking queue + WebRTC signaling relay (Durable Object).
 */

function haversineKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    Number.isNaN(lat1) || Number.isNaN(lon1) || Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Map<string, { ws: WebSocket, lat: number|null, lon: number|null, colo: string, country: string, inQueue: boolean, roomId: string|null, peerId: string|null, joinedAt: number }>} */
    this.sessions = new Map();
    /** @type {string[]} */
    this.queue = [];
    /** @type {Map<string, { a: string, b: string }>} */
    this.rooms = new Map();
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
      lat: geo.lat,
      lon: geo.lon,
      colo: geo.colo,
      country: geo.country,
      inQueue: false,
      roomId: null,
      peerId: null,
      joinedAt: Date.now(),
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
      default:
        this.sendTo(playerId, { type: "error", message: "unknown_type" });
    }
  }

  joinQueue(playerId) {
    this.pruneDead();
    const s = this.sessions.get(playerId);
    if (!s || !isOpen(s.ws)) return;
    if (s.roomId) {
      // Soft-cancel a failed WebRTC attempt so the player can requeue.
      this.cancelMatch(playerId);
    }
    if (s.inQueue) {
      this.sendTo(playerId, { type: "queue_joined" });
      return;
    }

    let bestId = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const otherId of this.queue) {
      if (otherId === playerId) continue;
      const other = this.sessions.get(otherId);
      if (!other || !other.inQueue || other.roomId || !isOpen(other.ws)) continue;
      const d = haversineKm(s.lat, s.lon, other.lat, other.lon);
      if (d < bestDist) {
        bestDist = d;
        bestId = otherId;
      }
    }

    if (bestId && this.isAlive(bestId)) {
      this.formMatch(bestId, playerId);
      return;
    }

    s.inQueue = true;
    if (!this.queue.includes(playerId)) this.queue.push(playerId);
    this.sendTo(playerId, { type: "queue_joined" });
  }

  leaveQueue(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return;
    s.inQueue = false;
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
      // One side died — put the survivor back in queue.
      if (host && isOpen(host.ws)) {
        host.inQueue = true;
        if (!this.queue.includes(hostId)) this.queue.push(hostId);
      }
      if (guest && isOpen(guest.ws)) {
        guest.inQueue = true;
        if (!this.queue.includes(guestId)) this.queue.push(guestId);
      }
      return;
    }

    this.leaveQueue(hostId);
    this.leaveQueue(guestId);

    const roomId = randomId();
    const matchSeed = randomSeed();
    this.rooms.set(roomId, { a: hostId, b: guestId });

    host.inQueue = false;
    guest.inQueue = false;
    host.roomId = roomId;
    guest.roomId = roomId;
    host.peerId = guestId;
    guest.peerId = hostId;

    this.sendTo(hostId, {
      type: "match_found",
      roomId,
      matchSeed,
      isHost: true,
      seat: 0,
      peerId: guestId,
    });
    this.sendTo(guestId, {
      type: "match_found",
      roomId,
      matchSeed,
      isHost: false,
      seat: 1,
      peerId: hostId,
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

    if (s.peerId) {
      const peer = this.sessions.get(s.peerId);
      if (peer) {
        peer.peerId = null;
        if (peer.roomId) this.rooms.delete(peer.roomId);
        peer.roomId = null;
        this.sendTo(s.peerId, { type: "peer_left" });
      }
    }
    if (s.roomId) this.rooms.delete(s.roomId);
    this.sessions.delete(playerId);
  }
}
