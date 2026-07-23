/**
 * WebRTC DataChannel peer connection (host creates offer).
 */
import { encode, decode } from "./protocol.js";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeerConnection({ isHost, onSignal, onMessage, onOpen, onClose }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  let channel = null;
  let makingOffer = false;

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      onSignal({ kind: "ice", candidate: ev.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
      onClose?.({ reason: pc.connectionState });
    }
  };

  function wireChannel(ch) {
    channel = ch;
    ch.binaryType = "arraybuffer";
    ch.onopen = () => onOpen?.();
    ch.onclose = () => onClose?.({ reason: "channel_closed" });
    ch.onerror = () => onClose?.({ reason: "channel_error" });
    ch.onmessage = (ev) => {
      try {
        onMessage?.(decode(ev.data));
      } catch {
        /* ignore */
      }
    };
  }

  if (isHost) {
    const ch = pc.createDataChannel("game", { ordered: true });
    wireChannel(ch);
  } else {
    pc.ondatachannel = (ev) => wireChannel(ev.channel);
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

  function send(msg) {
    if (channel && channel.readyState === "open") {
      channel.send(encode(msg));
      return true;
    }
    return false;
  }

  function close() {
    try {
      channel?.close();
    } catch {
      /* ignore */
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
    send,
    close,
    get makingOffer() {
      return makingOffer;
    },
  };
}
