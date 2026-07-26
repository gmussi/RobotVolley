# macOS signing & notarization (Steam builds)

Robot Volley ships on Steam via **Developer ID** (outside the Mac App Store).
Players need a **signed + notarized** `.app` or Gatekeeper blocks launch.

This project uses **Option B: App Store Connect API key** for notarization
(not an app-specific password).

## Prerequisites

- Active **Apple Developer Program** membership
- **Developer ID Application** certificate in your Mac Keychain
- **App Store Connect API key** (`.p8` file) — steps below

## 1. Developer ID Application certificate

1. Open **Xcode → Settings → Accounts** → your Apple ID → your team.
2. **Manage Certificates… → + → Developer ID Application**.
3. Verify:

```bash
security find-identity -v -p codesigning
```

You should see `Developer ID Application: … (TEAMID)`.

Note your **Team ID** (10 characters) from [developer.apple.com/account](https://developer.apple.com/account) → Membership details.

## 2. App Store Connect API key (Option B)

1. Open [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api).
2. Under **Team Keys**, click **+** (or generate an Individual key if you enrolled as individual — see note below).
3. Name it e.g. `robot-volley-notarize`, access **Developer** or **Admin**.
4. **Download the `.p8` file** (`AuthKey_XXXXXXXXXX.p8`) — **only once**.
5. Copy **Key ID** (10 chars) and **Issuer ID** (UUID at top of the page).

Store the `.p8` outside the repo, e.g.:

```text
~/.apple/AuthKey_XXXXXXXXXX.p8
chmod 600 ~/.apple/AuthKey_XXXXXXXXXX.p8
```

**Key ID must match the filename:** `AuthKey_4ZJVDMV9UZ.p8` → `APPLE_API_KEY_ID=4ZJVDMV9UZ`.
If path and ID point at different keys, notarization returns **401 Unauthorized**.

### Two keys? Individual vs Team

App Store Connect can show more than one key:

| Key location | Works for notarization? |
|--------------|-------------------------|
| **Integrations → Team Keys** | **Yes** — use this one (with Issuer ID) |
| **People → Individual Keys** | **No** — returns 401 for `notarytool` |

Test a key before building:

```bash
xcrun notarytool history \
  --key ~/.apple/AuthKey_XXXXXXXXXX.p8 \
  --key-id XXXXXXXXXX \
  --issuer YOUR-ISSUER-UUID
```

Success prints `No submission history.` or a list — not `401 Unauthenticated`.

### Team key vs Individual key

| Key type | `APPLE_API_ISSUER` | When to use |
|----------|-------------------|-------------|
| **Team** | Required (UUID) | Organization enrollment, or Team key on individual account |
| **Individual** | **Omit** | Individual enrollment + Xcode 26+ only; omit issuer or notarization returns 401 |

## 3. Local build (signed + notarized)

Add to `.env` (gitignored):

```bash
# Path to the downloaded .p8 (never commit this file)
APPLE_API_KEY=/Users/you/.apple/AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # Team keys only
```

Signing uses the **Developer ID cert in your Keychain** automatically.
With `APPLE_API_*` env vars set, `electron-builder` signs and notarizes in one step:

```bash
npm run electron:build
```

If API key env vars are unset, the macOS build completes **signed only** (not notarized).

## 4. Verify

```bash
spctl -a -vvv "release/mac-arm64/Robot Volley.app"
codesign -dv --verbose=4 "release/mac-arm64/Robot Volley.app"
```

Expect `accepted` / `Notarized Developer ID`. Launch the app and smoke-test menu → match → quit.

```bash
npm run electron:smoke   # headless harnesses (unset ELECTRON_RUN_AS_NODE if needed)
```

## 5. GitHub Actions (CI)

Add **Secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `APPLE_API_KEY_P8` | Full contents of the `.p8` file |
| `APPLE_API_KEY_ID` | Key ID |
| `APPLE_API_ISSUER` | Issuer UUID (Team keys; omit secret for Individual keys) |
| `CSC_LINK` | Base64-encoded `.p12` export of your Developer ID cert (for CI signing) |
| `CSC_KEY_PASSWORD` | Password used when exporting the `.p12` |

Export `.p12` from Keychain Access → Developer ID Application → Export.

The macOS CI job writes `APPLE_API_KEY_P8` to a temp file and sets `APPLE_API_KEY` to that path before `npm run electron:build`.

## 6. Export for SteamPipe

After a good build, upload the contents of:

```text
release/mac-arm64/Robot Volley.app
```

via `steam/build/` VDF scripts (once Steam App ID exists).
