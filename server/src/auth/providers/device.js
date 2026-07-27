/**
 * Anonymous device provider — the zero-friction default.
 *
 * The client generates a long random secret on first run and keeps it in the
 * save file (Steam-Cloud-synced on desktop). That secret *is* the ticket. The
 * server never stores it: the identity key is its SHA-256, so a database leak
 * cannot be replayed as a login.
 *
 * This is deliberately the weakest identity in the system — it is device-bound
 * and unrecoverable if the save is lost. Linking a real platform identity (or a
 * link code) is what turns it into durable progression.
 */

const MIN_SECRET_LENGTH = 32;

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const deviceProvider = {
  id: "device",

  async verify(ticket) {
    if (typeof ticket !== "string" || ticket.length < MIN_SECRET_LENGTH) return null;
    return { uid: await sha256Hex(ticket) };
  },
};
