# SteamPipe build scripts (M5)

Template VDF files for uploading desktop builds to Steam. **Replace all
`REPLACE_*` placeholders** once the Steam app and depots exist in the partner
site.

## Prerequisites

1. Real **App ID** and **depot IDs** from Steamworks (blocked until partner
   account review clears).
2. A packaged build in `release/` from `npm run electron:build` (or CI
   artifacts from `.github/workflows/desktop-build.yml`).
3. [`steamcmd`](https://developer.valvesoftware.com/wiki/SteamCMD) installed
   and logged in with a **build account** (not your personal login if possible).

## One-time setup

1. Copy the templates and fill in IDs:

   ```bash
   cp app_build_TEMPLATE.vdf app_build_<APP_ID>.vdf
   cp depot_build_win_TEMPLATE.vdf depot_build_<WIN_DEPOT_ID>.vdf
   cp depot_build_mac_TEMPLATE.vdf depot_build_<MAC_DEPOT_ID>.vdf
   ```

2. Edit each file — search for `REPLACE_` and substitute real values.

3. Rename the Steam Input manifest for the real app id:

   ```bash
   cp ../controller_config/game_actions_480.vdf \
      ../controller_config/game_actions_<APP_ID>.vdf
   ```

4. Update achievement API names in `src/platform/achievements.js` (`STEAM_IDS`).

## Upload (manual first time)

From the **repo root** (paths in the VDFs are relative to here):

```bash
steamcmd +login <build_account> \
  +run_app_build "$(pwd)/steam/build/app_build_<APP_ID>.vdf" \
  +quit
```

Steam Guard will prompt on first login. For CI automation later, research
`+set_steam_guard_code` or a dedicated builder account with scriptable email
codes.

## Depot contents

| Platform | electron-builder output | Notes |
|----------|-------------------------|-------|
| Windows  | `release/win-unpacked/` | Raw files — SteamPipe wants a folder, not an installer |
| macOS    | `release/mac-arm64/Robot Volley.app` | Whole `.app` bundle |

The macOS depot VDF maps the `.app` from `release/mac-arm64/`. If CI produces
`release/mac/` (Intel runner) instead, adjust `LocalPath` accordingly.

## Controller config

Include `steam/controller_config/game_actions_<APP_ID>.vdf` in **both** depots
under `controller_config/` so Steam Input picks it up. Add a `FileMapping` in
each depot VDF or copy the file into the build output before upload.
