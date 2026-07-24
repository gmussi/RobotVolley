/**
 * Steam graceful-degradation test — run with `electron electron/smoke-steam.cjs`.
 * With no Steam client running, tryInit() must return false WITHOUT throwing, and
 * every Steam call must be a safe no-op. Exits 0 if it degrades cleanly.
 */
const { app } = require("electron");
const steam = require("./steam.cjs");

app.whenReady().then(() => {
  let ok = true;
  try {
    const available = steam.tryInit(); // false when Steam isn't running
    const unlocked = steam.unlockAchievement("ACH_WIN_ONE_GAME"); // safe no-op
    const player = steam.getPlayer(); // null
    // We can't assert Steam IS available in CI, but it must never throw and the
    // no-Steam path must return the safe falsy values.
    if (typeof available !== "boolean") { console.error("FAIL: tryInit non-boolean"); ok = false; }
    if (!available && (unlocked !== false || player !== null)) {
      console.error("FAIL: no-Steam calls not safe no-ops", { unlocked, player });
      ok = false;
    }
    console.log(`PASS: steam module degraded cleanly (available=${available}).`);
  } catch (err) {
    console.error("FAIL: threw:", err && err.message);
    ok = false;
  }
  app.exit(ok ? 0 : 1);
});

setTimeout(() => { console.error("FAIL: timeout"); app.exit(1); }, 15000);
