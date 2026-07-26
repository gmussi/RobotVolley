# Steam Release — M5: Packaging, Signing & Store

**Status as of 2026-07-26: M1–M4 complete. M5 nearly complete on the code/infra
side.** Done: desktop builds, CI, SteamPipe VDF templates, TURN relay, music
licensing, **macOS signed + notarized builds locally** (Developer ID + App Store
Connect API key). Remaining: GitHub signing secrets for CI, Steam partner review
(App ID), store page, legal docs. See **Hard blockers** and next steps below.

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
- Online: existing WebRTC + Cloudflare matchmaker + Metered.ca TURN relay.
- Controllers: full Gamepad API + rebinding UI + Steam Input config.
- macOS notarization: **App Store Connect API key** (Option B), Team key with
  Issuer ID — see `docs/MACOS_SIGNING.md`.

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
- **TURN relay**: Metered.ca credentials wired via `.env` (local) and GitHub
  Actions vars/secrets. Baked into web and desktop builds. Still worth
  smoke-testing online from two different networks before launch.
- **Desktop app icons**: `build/icon.icns` + `build/icon.ico` committed; wired
  into `electron-builder`. Verified in packaged builds.
- **Credits screen**: verified attributions (music: Pixabay; fonts: SIL OFL;
  Electron: MIT). See `docs/MUSIC_LICENSES.md`.
- **Quit**: desktop-only "QUIT" item on the main menu, wired to `app.quit()`.
- **Verification harness**: `electron/smoke*.cjs` + `npm test`. Run after any
  change to `electron/main.cjs`, `electron/preload.cjs`, or `package.json`
  `"build"` block.

## M5 done — don't redo this

- **Windows + macOS builds** — `win.target` / `mac.target` are `["dir"]`
  (unpacked folders for SteamPipe). Verified locally and via CI
  (`.github/workflows/desktop-build.yml`).
- **CI desktop matrix** — matrixes `windows-latest` + `macos-latest`, uploads
  artifacts. macOS job runs smoke harnesses. TURN + matchmaking env vars passed
  → uploads artifacts. macOS job runs smoke harnesses. TURN + matchmaking env vars passed
  into build. **Apple notarization secrets on GitHub; CSC (code-sign `.p12`) still
  pending** — see `docs/GITHUB_ACTIONS.md`.
- **SteamPipe VDF templates** — `steam/build/` (`*_TEMPLATE.vdf` + `README.md`).
- **macOS signing + notarization (local)** — verified 2026-07-26:
  - Developer ID Application cert in Keychain
  - App Store Connect **Team** API key (`AuthKey_<KEY_ID>.p8` must match
    `APPLE_API_KEY_ID`; Individual keys return 401 for notarization)
  - `build/entitlements.mac*.plist`, `package.json` `hardenedRuntime` +
    `notarize: true`
  - `npm run electron:build` with `.env` → `spctl -a -vvv` reports
    `accepted` / `Notarized Developer ID`
  - Full setup: [`docs/MACOS_SIGNING.md`](./MACOS_SIGNING.md)

## Hard blockers (need the user, not more code)

1. **Steam account under review** (as of 2026-07-23) — cannot create the real
   Steam app, App ID, SteamPipe upload, or store page until this clears.
2. **Publisher name / legal entity for store docs** — credits screen, EULA, and
   privacy policy need the real developer/publisher name (likely the CNPJ org
   used on Steam). Ask the user; do not invent one.

## M5 remaining work

### Step 2 — macOS signing in CI

**GitHub secrets configured (2026-07-26):** `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER` — see [`docs/GITHUB_ACTIONS.md`](./GITHUB_ACTIONS.md).

**Still manual:** `CSC_LINK` + `CSC_KEY_PASSWORD` (export Developer ID `.p12` from
Keychain Access — automated export was blocked by macOS Keychain prompt). Until
those are set, CI macOS artifacts are unsigned; local signed+notarized builds work
via Keychain + `.env`.

Local setup: [`docs/MACOS_SIGNING.md`](./MACOS_SIGNING.md).

### Step 3 — SteamPipe upload (blocked on Steam App ID)

Once the Steam app exists:
1. Update `steam_appid.txt` (gitignored) and rename
   `game_actions_480.vdf` → `game_actions_<real-app-id>.vdf`; swap `STEAM_IDS`
   in `src/platform/achievements.js`.
2. Create Windows + macOS depots in Steamworks partner site.
3. Copy VDF templates from `steam/build/`, fill in real App/depot IDs.
4. First upload manual via `steamcmd +run_app_build …`.

Upload paths:
- Windows: `release/win-unpacked/`
- macOS: `release/mac-arm64/Robot Volley.app` (signed + notarized build)

### Step 5 — Steam store page (blocked on Steam App ID)

- Source copy: `docs/STORE_COPY.md`, visuals: `docs/ART_BIBLE.md`
- Screenshots: `npm run dev` → `node tools/capture_store_shots.mjs http://localhost:5173`
  (needs `playwright` + chromium — see script header)
- Complete content survey, IARC age rating, system requirements in partner site

### Step 6 — Legal / compliance (blocked on publisher name)

- **EULA + privacy policy** — disclose WebRTC P2P (IP) and GeoIP matchmaking
  (`server/src/matchmaker.js`). Needs publisher name.
- **NOTICES audit** — optional; fonts/music/Electron in Credits. Double-check
  `steamworks.js` if bundled into shipped app.

### Pre-launch smoke tests (no blocker, should do before release)

- [ ] Online match from **two different networks** (TURN relay verification)
- [ ] Launch signed `.app` on a clean Mac (not your dev machine)
- [ ] Windows build on a real Windows machine (or CI artifact)
- [ ] Click-through: menu → match → online → quit

## Verification checklist for any M5 change

```bash
npm run build && npm test
npm run electron:smoke                            # unset ELECTRON_RUN_AS_NODE if needed
npm run electron:build                              # ~15–20 min with notarization
spctl -a -vvv "release/mac-arm64/Robot Volley.app"  # expect: accepted, Notarized Developer ID
```

Remember to `rm -rf release/` after manual verification — gitignored.

**Cursor/IDE note:** If `npm run electron:smoke` fails on `ipcMain`, run
`unset ELECTRON_RUN_AS_NODE` first.

## Quick reference: files most relevant to M5

| Concern | File(s) |
|---|---|
| Packaging config | `package.json` (`"build"` block) |
| Window/lifecycle | `electron/main.cjs` |
| Icons | `build/icon.icns`, `build/icon.ico` |
| macOS signing | `docs/MACOS_SIGNING.md`, `build/entitlements.mac*.plist` |
| Steam achievements/App ID | `electron/steam.cjs`, `src/platform/achievements.js` |
| Steam Input | `steam/controller_config/game_actions_480.vdf` |
| Store copy | `docs/STORE_COPY.md`, `docs/ART_BIBLE.md` |
| CI | `.github/workflows/desktop-build.yml`, [`GITHUB_ACTIONS.md`](./GITHUB_ACTIONS.md) |
| SteamPipe VDFs | `steam/build/` |
| Credits / licensing | `src/data/credits.js`, `docs/MUSIC_LICENSES.md` |
