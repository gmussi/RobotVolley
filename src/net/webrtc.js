/**
 * WebRTC peer connection with two DataChannels:
 * - ctrl: reliable/ordered (hello, serve edges)
 * - game: unreliable/unordered (state snapshots, inputs) — avoids backlog hitching
 */
import { encode, decode } from "./protocol.js";

/**
 * STUN alone can't traverse symmetric NAT / restrictive firewalls, which is
 * common on Steam's broad player base. A TURN relay is optional and configured
 * the same way as VITE_MATCHMAKING_URL: unset by default (STUN-only, unchanged
 * behavior), or provided at build time. VITE_TURN_URL accepts a comma-separated
 * list of URLs (e.g. a UDP and a TCP/TLS fallback) sharing one credential pair.
 */
function buildIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    const urls = turnUrl.split(",").map((u) => u.trim()).filter(Boolean);
    if (urls.length) {
      servers.push({
        urls,
        username: import.meta.env.VITE_TURN_USERNAME || undefined,
        credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
      });
    }
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();

export function createPeerConnection({ isHost, onSignal, onMessage, onOpen, onClose }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  let ctrl = null;
  let game = null;
  let ctrlOpen = false;
  let gameOpen = false;
  let makingOffer = false;
  let opened = false;

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      onSignal({ kind: "ice", candidate: ev.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "disconnected" ||
      pc.connectionState === "closed"
    ) {
      onClose?.({ reason: pc.connectionState });
    }
  };

  function maybeOpen() {
    if (opened || !ctrlOpen || !gameOpen) return;
    opened = true;
    onOpen?.();
  }

  function wireChannel(ch, kind) {
    ch.binaryType = "arraybuffer";
    ch.onopen = () => {
      if (kind === "ctrl") {
        ctrl = ch;
        ctrlOpen = true;
      } else {
        game = ch;
        gameOpen = true;
      }
      maybeOpen();
    };
    ch.onclose = () => onClose?.({ reason: `${kind}_closed` });
    ch.onerror = () => onClose?.({ reason: `${kind}_error` });
    ch.onmessage = (ev) => {
      try {
        onMessage?.(decode(ev.data), kind);
      } catch {
        /* ignore */
      }
    };
  }

  if (isHost) {
    wireChannel(pc.createDataChannel("ctrl", { ordered: true }), "ctrl");
    wireChannel(
      pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 }),
      "game",
    );
  } else {
    pc.ondatachannel = (ev) => {
      const kind = ev.channel.label === "ctrl" ? "ctrl" : "game";
      wireChannel(ev.channel, kind);
    };
  }

  async function handleSignal(payload) {
    if (!payload || !payload.kind) return;
    if (payload.kind === "offer") {
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onSignal({ kind: "answer", sdp: pc.localDescription });
    } else if (payload.kind === "answer") {
      await pc.setRemoteDescription(payload.sdp);
    } else if (payload.kind === "ice" && payload.candidate) {
      try {
        await pc.addIceCandidate(payload.candidate);
      } catch {
        /* ignore late/bad ICE */
      }
    }
  }

  async function startHostOffer() {
    if (!isHost) return;
    makingOffer = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onSignal({ kind: "offer", sdp: pc.localDescription });
    } finally {
      makingOffer = false;
    }
  }

  function sendCtrl(msg) {
    if (ctrl && ctrl.readyState === "open") {
      ctrl.send(encode(msg));
      return true;
    }
    return false;
  }

  function sendGame(msg) {
    if (game && game.readyState === "open") {
      // Drop rather than queue if the buffer is backing up.
      if (game.bufferedAmount > 256 * 1024) return false;
      game.send(encode(msg));
      return true;
    }
    return false;
  }

  function close() {
    for (const ch of [ctrl, game]) {
      try {
        ch?.close();
      } catch {
        /* ignore */
      }
    }
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }

  return {
    handleSignal,
    startHostOffer,
    sendCtrl,
    sendGame,
    /** @deprecated use sendCtrl/sendGame */
    send: sendCtrl,
    close,
    get makingOffer() {
      return makingOffer;
    },
  };
}
