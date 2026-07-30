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
  // Sent once a peer's data channel handshake completes and beginMatch() runs.
  // The server uses this — not either client's later say-so — to decide
  // whether a dropped connection is a real forfeit or just a failed setup.
  MATCH_STARTED: "match_started",
  // Both peers report the finished match; the server records it only when the
  // two reports agree. Rides the matchmaking socket, which stays open for the
  // whole match, so no extra connection is needed.
  MATCH_RESULT: "match_result",
  RESULT_RECORDED: "result_recorded",
  // Pushed to BOTH seats once a match settles, carrying each side's newly
  // unlocked cosmetics so the post-match reveal can show who won what.
  //
  // RESULT_RECORDED cannot carry this: it answers the peer that just reported,
  // and the *first* reporter only ever hears "pending" — the match does not
  // settle until the second report arrives. Only the server sees both sides'
  // unlocks at once, which also means neither client has to trust the other's
  // claim about what it earned.
  RESULT_SETTLED: "result_settled",
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
