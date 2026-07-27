/** Shared message type constants (matchmaker WS + WebRTC DataChannel). */

export const MM = {
  HELLO: "hello",
  // Sent as the first frame after connect, carrying the session JWT. The token
  // travels in the message body rather than the URL so it never lands in an
  // access log. Queueing is refused until it arrives.
  AUTH: "auth",
  AUTHED: "authed",
  JOIN_QUEUE: "join_queue",
  LEAVE_QUEUE: "leave_queue",
  CANCEL_MATCH: "cancel_match",
  QUEUE_JOINED: "queue_joined",
  MATCH_FOUND: "match_found",
  SIGNAL: "signal",
  PEER_LEFT: "peer_left",
  // Both peers report the finished match; the server records it only when the
  // two reports agree. Rides the matchmaking socket, which stays open for the
  // whole match, so no extra connection is needed.
  MATCH_RESULT: "match_result",
  RESULT_RECORDED: "result_recorded",
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
