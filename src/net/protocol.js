/** Shared message type constants (matchmaker WS + WebRTC DataChannel). */

export const MM = {
  HELLO: "hello",
  JOIN_QUEUE: "join_queue",
  LEAVE_QUEUE: "leave_queue",
  CANCEL_MATCH: "cancel_match",
  QUEUE_JOINED: "queue_joined",
  MATCH_FOUND: "match_found",
  SIGNAL: "signal",
  PEER_LEFT: "peer_left",
  ERROR: "error",
};

export const DC = {
  HELLO: "hello",
  INPUT: "input",
  STATE: "state",
  SERVE: "serve",
};

export function encode(msg) {
  return JSON.stringify(msg);
}

export function decode(raw) {
  if (typeof raw === "string") return JSON.parse(raw);
  return JSON.parse(new TextDecoder().decode(raw));
}
