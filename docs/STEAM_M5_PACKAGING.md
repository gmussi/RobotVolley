# Steam Release — M5: Packaging, Signing & Store

**Status as of 2026-07-26: M1–M4 complete and verified. M5 in progress** — Steps 1
(unblocked), 3 (VDF templates), and 4 (CI desktop matrix) done locally; Steps 2,
5, and 6 remain blocked on user/partner accounts (see Hard blockers).
This file is the handoff doc for M5 — read it fresh in a new session to resume
without re-deriving context. It assumes the reader has no memory of prior
sessions; everything needed to continue is below or linked.

## Where this fits

RobotVolley (vanilla-JS/Canvas/Vite web game) is being shipped on Steam by
wrapping the existing codebase in **Electron** — not rebuilding. Full
architecture decisions and the original phased plan (workstreams A–K) are
irrelevant to reproduce here; what matters for M5 is the state below.

**Decisions already locked (do not re-litigate):**
- Wrapper: Electron.
- Platforms v1: **Windows + macOS** (no Linux/Steam Deck).
- Online: existing WebRTC + Cloudflare matchmaker, with optional TURN.
- Controllers: full Gamepad API + rebinding UI + Steam Input config.

## What's already done (M1–M4) — don't redo this

- **Electron shell**: `electron/main.cjs` (window, single-instance guard,
  `fullscreen: true` always-on launch), `electron/preload.cjs` (sandboxed
  `window.desktop` bridge), `electron/windowState.cjs`. Renderer stays
  `contextIsolation: true` / `sandbox: true` / `nodeIntegration: false`.
- **Offline-safe**: fonts self-hosted via `@fontsource` (no CDN calls).
- **Save layer**: `src/platform/save.js` — localStorage on web, a JSON file in
  Electron's `userData` on desktop (Steam Auto-Cloud target, see below).
- **Controllers**: full Gamepad API (`src/input/gamepad.js`) + rebinding UI
  (`src/ui/controlsScreen.js`) + persisted bindings (`src/data/controls.js`).
- **Steam integration**: `electron/steam.cjs` wraps `steamworks.js` — graceful
  no-op when Steam isn't running, achievements (`src/platform/achievements.js`,
  logical keys mapped to Steam API names, currently pointed at **Spacewar (App
  480)** placeholders for testing), Steam Input action manifest
  (`steam/controller_config/game_actions_480.vdf`).
- **TURN support**: `src/net/webrtc.js` reads `VITE_TURN_URL` /
  `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` (see `.env.example`), defaults
  to STUN-only if unset. **Still needs the user to supply a real relay +
  credentials** — code is ready, untested against a live TURN server.
- **Desktop app icons**: `tools/build_desktop_icons.mjs` generates
  `build/icon.icns` + `build/icon.ico` from `public/icon-512.png` (macOS
  `sips`/`iconutil` for icns, hand-packed PNG-in-ICO for ico — no image-lib
  dependency). Already wired into `electron-builder`'s `mac.icon`/`win.icon` in
  `package.json`. **Verified with a real packaged build** — icon embeds
  correctly in the `.app`.
- **Credits screen**: `src/ui/creditsScreen.js` + `src/data/credits.js`,
  reached via a footer link on the main menu (not a list item). Contains only
  *verified* attributions (fonts: SIL OFL 1.1; Electron: MIT). **Music/SFX
  attribution is deliberately omitted** — see Blockers below.
- **Quit**: desktop-only "QUIT" item on the main menu, wired to
  `app.quit()` via IPC.
- **Build config exists** in `package.json`'s `"build"` block: `appId`,
  `productName`, `directories.output = "release"`,
  `directories.buildResources = "build"`, `mac.target = ["dir"]`,
  `win.target = ["dir"]`, icons wired. `npm run electron:build` works today
  and produces an **unsigned** `release/mac-arm64/Robot Volley.app` (verified
  by actually launching it and inspecting `Info.plist`).
- Verification harness: `electron/smoke*.cjs` (boot, save round-trip, Steam
  graceful degradation, quit IPC) + `npm test` (41 Vitest tests). Run all of
  these after any M5 change that touches `electron/main.cjs`,
  `electron/preload.cjs`, or `package.json`'s build config.

## Hard blockers (need the user, not more code)

1. **Steam account under review** (as of 2026-07-23) — cannot create the real
   Steam app, cannot get a real App ID, cannot upload to SteamPipe, cannot set
   up the store page, until this clears. Everything else in M5 *except*
   Steamworks-partner-site steps can proceed without it.
2. **No Apple Developer account** — macOS code signing + notarization is
   blocked without one ($99/yr). Without signing, Gatekeeper will block the
   `.app` for end users even distributed via Steam (Steam does not bypass
   Gatekeeper). This is required before a real macOS release, not optional.
3. ~~**No TURN server/credentials supplied yet**~~ **Configured (2026-07-26)** —
   Metered.ca relay wired via `.env` locally and GitHub Actions vars/secrets
   (`VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`). Still
   worth smoke-testing online from two different networks before launch.
4. **Music/SFX licensing unverified** — `docs/STORE_COPY.md` already flags:
   *"Verify commercial rights for all music in `src/assets/audio/` before paid
   store release. Untracked root MP3s must be licensed or removed."* Two loose
   root MP3s (`moodmode-*.mp3`, `petrushkasound-*.mp3`) still exist in the repo
   root — confirm their status and either license them properly or delete
   them; they're already excluded from the shipped build but sitting in git
   history/working tree is still a risk to clean up.
5. **No real developer/publisher name established** — the credits screen and
   any EULA/legal docs need a real name/entity for copyright lines. Ask the
   user rather than inventing one.

## M5 remaining work, broken into ordered steps

### Step 1 — Windows build (no blocker, can do now)
- `win.target` is currently `["dir"]` (unpacked folder — correct for
  SteamPipe, which wants raw files per depot, not an installer). **Verified
  via CI** (`.github/workflows/desktop-build.yml` → `windows-latest` →
  `release/win-unpacked`). macOS build verified locally
  (`release/mac-arm64/Robot Volley.app`).
- Decide whether to *also* produce an NSIS installer (`win.target: ["nsis",
  "dir"]`) for non-Steam distribution (e.g. a direct-download version on the
  studio's own site). Not needed for Steam itself.

### Step 2 — macOS signing + notarization (blocked on Apple Developer account)
Once the account exists:
- Get a "Developer ID Application" certificate (for direct distribution outside
  the Mac App Store — this is the right cert type for Steam).
- Add signing config to `package.json`'s `mac` block: `hardenedRuntime: true`,
  `entitlements`/`entitlementsInherit` (Electron apps typically need
  `com.apple.security.cs.allow-jit` etc. — see electron-builder's Apple docs),
  and either `CSC_LINK`/`CSC_KEY_PASSWORD` env vars or explicit `identity`.
- Notarization: electron-builder can automate this via `afterSign` hook +
  Apple's `notarytool`, needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (or API
  key), `APPLE_TEAM_ID` env vars. Add a `notarize.js` afterSign script (common
  pattern: `@electron/notarize` package).
- Re-verify with the existing smoke tests + a real launched `.app` after
  signing (Gatekeeper should no longer block it — test with `spctl -a -vvv
  "release/.../Robot Volley.app"`).

### Step 3 — SteamPipe depots (blocked on Steam App ID)
Once the Steam app exists and has an App ID:
1. Update `steam_appid.txt` (gitignored, dev-only) and rename
   `steam/controller_config/game_actions_480.vdf` →
   `game_actions_<real-app-id>.vdf`, and swap `STEAM_IDS` values in
   `src/platform/achievements.js` from the Spacewar placeholders to the real
   achievement API names defined in the Steamworks partner backend.
2. Create one **depot** per platform (Windows, macOS) in the Steamworks
   partner site.
3. ~~Add `steamcmd` + app/depot **VDF build scripts**~~ **Done** — template
   VDFs live in `steam/build/` (`*_TEMPLATE.vdf` + `README.md`). Copy and
   fill in real App/depot IDs once the Steam app exists.
4. First upload is manual (`steamcmd +login <user> +run_app_build
   <path-to-vdf> +quit`) to validate before automating in CI.

### Step 4 — CI matrix for desktop builds (no blocker, can do now)
- ~~Extend `.github/workflows/`~~ **Done** — `.github/workflows/desktop-build.yml`
  matrixes `windows-latest` + `macos-latest`, runs `npm ci` →
  `npm run electron:build` → uploads artifacts (`robot-volley-win-unpacked`,
  `robot-volley-mac-arm64`). macOS job also runs the four `electron/smoke*.cjs`
  harnesses.
- **Icons**: `build/icon.icns` + `build/icon.ico` are committed — CI does not
  need to regenerate them.
- macOS signing (Step 2) needs secrets (`CSC_LINK`, `APPLE_ID`, etc.) added as
  GitHub Actions secrets before the CI job can sign — until then, CI should
  produce unsigned builds (fine for internal testing, not for release).
- Optional: automated SteamPipe upload on tagged releases (needs a Steam
  **build account** + Steam Guard handling — mobile 2FA can't run headless
  without special setup; research `steamcmd`'s `+set_steam_guard_code` flow or
  use a dedicated builder account with Steam Guard email codes scriptable via
  a mail API). Treat this as a nice-to-have; manual upload is fine for launch.

### Step 5 — Steam store page (blocked on Steam App ID)
- Reuse `docs/STORE_COPY.md` (tagline, short/long description, keywords, press
  blurb — already written) and `docs/ART_BIBLE.md` (visual identity/colors) as
  source material.
- Capture store screenshots with the existing tool:
  `npm run dev` (or `electron:preview`) then
  `node tools/capture_store_shots.mjs http://localhost:5173` (needs
  `npm install -D playwright && npx playwright install chromium` first per the
  script's own header comment).
- Complete Steam's **content survey**, age rating (IARC questionnaire), system
  requirements, and required legal docs (Step 6) in the partner site.

### Step 6 — Legal / compliance (mostly blocked on user input)
- **EULA + privacy policy**: online mode transmits IP for P2P WebRTC and does
  GeoIP-based proximity matchmaking (see `server/src/matchmaker.js`) — this
  must be disclosed. No draft exists yet; needs the real
  developer/publisher name (see Blocker 5) before it can be written.
- **Third-party licenses**: fonts + Electron are already covered by the
  in-game Credits screen. Still needed: audit remaining npm
  dependencies (`package.json` devDependencies — most are build-time only and
  don't ship, but double-check `steamworks.js` and anything actually bundled
  into the Electron app for license notice requirements) and produce a
  NOTICES file if warranted.
- **Music/SFX**: see Blocker 4 — must resolve before this step can close.

## Verification checklist for any M5 change

Run after touching `electron/main.cjs`, `electron/preload.cjs`, or the
`package.json` `"build"` block:

```bash
npm run build && npm test                         # vitest suite must pass
npm run electron:smoke                            # all four headless harnesses
npm run electron:build                              # real packaged build
# then actually launch the produced .app / .exe and click through:
# title -> menu -> a match -> pause -> quit
```

For macOS-specific packaging checks:
```bash
file "release/mac-arm64/Robot Volley.app/Contents/Resources/icon.icns"
grep -A1 CFBundleIconFile "release/mac-arm64/Robot Volley.app/Contents/Info.plist"
spctl -a -vvv "release/mac-arm64/Robot Volley.app"   # Gatekeeper check (will fail until signed)
```

Remember to `rm -rf release/` after manual verification — it's gitignored and
shouldn't be committed.

**Cursor/IDE note:** If `npm run electron:smoke` fails with
`Cannot read properties of undefined (reading 'on')` on `ipcMain`, check that
`ELECTRON_RUN_AS_NODE` is **not** set in the shell (Cursor's agent terminal
sometimes sets it). Run `unset ELECTRON_RUN_AS_NODE` first, or use an external
terminal.

## Quick reference: files most relevant to M5

| Concern | File(s) |
|---|---|
| Packaging config | `package.json` (`"build"` block) |
| Window/lifecycle | `electron/main.cjs` |
| Icons | `tools/build_desktop_icons.mjs`, `build/icon.icns`, `build/icon.ico` |
| Steam achievements/App ID | `electron/steam.cjs`, `src/platform/achievements.js`, `steam_appid.txt` (gitignored) |
| Steam Input | `steam/controller_config/game_actions_480.vdf`, `steam/README.md` |
| Store copy | `docs/STORE_COPY.md`, `docs/ART_BIBLE.md` |
| TURN config | `src/net/webrtc.js`, `.env.example`, README "Online multiplayer" section |
| CI | `.github/workflows/deploy.yml` (web), `.github/workflows/desktop-build.yml` (desktop) |
| SteamPipe VDFs | `steam/build/` |
| Credits / licensing | `src/ui/creditsScreen.js`, `src/data/credits.js`, this doc's Blockers section |
