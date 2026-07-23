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

export class Matchmaker {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {Map<string, { ws: WebSocket, lat: number|null, lon: number|null, colo: string, country: string, inQueue: boolean, roomId: string|null, peerId: string|null }>} */
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
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  sendTo(playerId, msg) {
    const s = this.sessions.get(playerId);
    if (s) this.send(s.ws, msg);
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
      case "signal":
        this.relaySignal(playerId, msg);
        break;
      default:
        this.sendTo(playerId, { type: "error", message: "unknown_type" });
    }
  }

  joinQueue(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return;
    if (s.roomId) {
      this.sendTo(playerId, { type: "error", message: "already_in_match" });
      return;
    }
    if (s.inQueue) {
      this.sendTo(playerId, { type: "queue_joined" });
      return;
    }

    // Prefer closest waiting player; match ASAP if anyone is available.
    let bestId = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const otherId of this.queue) {
      const other = this.sessions.get(otherId);
      if (!other || !other.inQueue || other.roomId) continue;
      const d = haversineKm(s.lat, s.lon, other.lat, other.lon);
      if (d < bestDist) {
        bestDist = d;
        bestId = otherId;
      }
    }

    if (bestId) {
      this.formMatch(bestId, playerId);
      return;
    }

    s.inQueue = true;
    this.queue.push(playerId);
    this.sendTo(playerId, { type: "queue_joined" });
  }

  leaveQueue(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return;
    s.inQueue = false;
    this.queue = this.queue.filter((id) => id !== playerId);
  }

  formMatch(hostId, guestId) {
    const host = this.sessions.get(hostId);
    const guest = this.sessions.get(guestId);
    if (!host || !guest) return;

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

    // Waiting player hosts (slightly warmer connection / first joiner).
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
