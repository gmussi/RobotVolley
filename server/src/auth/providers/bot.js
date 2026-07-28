/**
 * Matchmaking bot provider — the identity used by `tools/bot/`.
 *
 * Bots exist so the online queue is never empty. They are ordinary accounts in
 * every way that a player can see: they rank, they take and give Elo, they show
 * up on the leaderboard. The single thing this flag buys is *matchmaking
 * priority* — a human is never handed a bot while another human is available,
 * and bots only pair with each other when nobody real is waiting. See
 * shared/pairing.js.
 *
 * Because that flag is a privilege-shaped thing (a client that could claim it
 * would be able to deprioritise itself, and more importantly to lie about what
 * the queue contains), it is gated on a server secret rather than self-declared.
 * The ticket is `<BOT_SECRET>:<label>`: the prefix authorises, the label picks
 * which bot account you get, so a fleet of N bots is N stable accounts.
 *
 * With BOT_SECRET unset the provider refuses everything — a deploy that forgets
 * the secret has no bots, rather than an open door.
 */

const MIN_SECRET_LENGTH = 16;
const MAX_LABEL_LENGTH = 64;

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares every character, so a near-miss secret leaks nothing by timing. */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const botProvider = {
  id: "bot",
  isBot: true,

  async verify(ticket, env) {
    const secret = env?.BOT_SECRET;
    if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) return null;
    if (typeof ticket !== "string") return null;

    const split = ticket.indexOf(":");
    if (split <= 0) return null;
    const offered = ticket.slice(0, split);
    const label = ticket.slice(split + 1);
    if (!label || label.length > MAX_LABEL_LENGTH) return null;
    if (!safeEqual(offered, secret)) return null;

    // Hashed with the secret still attached, so rotating BOT_SECRET retires the
    // old fleet's accounts instead of letting a leaked label reclaim them.
    return { uid: await sha256Hex(ticket), isBot: true };
  },
};
