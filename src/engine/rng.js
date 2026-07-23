/**
 * Seeded PRNG for online match determinism (serve side + lottery).
 * Mulberry32 — small, fast, good enough for gameplay RNG.
 * When unset, always calls Math.random() so test spies keep working.
 */

let seeded = null;

export function setMatchSeed(seed) {
  let t = (seed >>> 0) || 1;
  seeded = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function clearMatchSeed() {
  seeded = null;
}

export function matchRandom() {
  return seeded ? seeded() : Math.random();
}

export function matchRandomInt(n) {
  return Math.floor(matchRandom() * n);
}
