# Steam integration — setup notes

Everything here is **development/config** for the Steam release. The game runs
fine without any of it (Steam is optional at runtime).

## App ID

- Local testing uses **480 (Spacewar)**, Valve's public test app, so Steamworks
  init + achievement calls succeed on any dev machine with Steam running.
- `steam_appid.txt` (repo root, git-ignored) holds the id read by `steamworks.init()`.
- At publish time, replace `480` with the real App ID in `steam_appid.txt` and via
  the `STEAM_APP_ID` env var used by `electron/steam.cjs`. Do **not** ship the dev
  `steam_appid.txt` in the packaged build.

## Testing achievements locally (App 480)

1. Have the Steam client running and logged in.
2. Add the built app (or `electron .`) as a **non-Steam game**, or run it from a
   shell where `steam_appid.txt` = 480 is in the working directory.
3. Win a match → `electron/steam.cjs` calls `achievement.activate("ACH_WIN_ONE_GAME")`.
   The logical→Steam id map lives in `src/platform/achievements.js` (`STEAM_IDS`);
   swap those to the real app's achievement ids once defined in the partner backend.

## Steam Input

- `controller_config/game_actions_480.vdf` defines the named action sets/actions.
- Rename to `game_actions_<real-app-id>.vdf` and upload it in the depot under
  `controller_config/`. Steam then offers per-user remapping + glyphs.
- Runtime input is the Web Gamepad API (`src/input/gamepad.js`); Steam Input is
  additive (covers exotic controllers + rebinding via the overlay).

## Steam Cloud (Auto-Cloud — no code)

- The save file is written by the app to Electron's `userData`:
  - Windows: `%APPDATA%/robot-volley/robotvolley-save.json`
  - macOS: `~/Library/Application Support/robot-volley/robotvolley-save.json`
- In the partner site → **Cloud → Auto-Cloud**, add a root + pattern pointing at
  that file (and `window-state.json` if you want layout synced). No code changes —
  `src/platform/save.js` already writes there.

## Depots / SteamPipe (M5)

- One depot per platform (Windows, macOS). Upload the `electron-builder` `dir`
  output via `steamcmd` + app/depot VDF build scripts (added in M5).
