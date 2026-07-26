# GitHub Actions — secrets & variables

Reference for **RobotVolley** repo (`gmussi/RobotVolley`). Values live only in
GitHub Settings → Secrets and variables → Actions — never commit them.

**Last updated:** 2026-07-26

## Variables (public to collaborators)

| Name | Purpose | Set |
|------|---------|-----|
| `VITE_MATCHMAKING_URL` | Web + desktop build — matchmaking WebSocket | Yes |
| `VITE_TURN_URL` | Web + desktop build — TURN relay URLs | Yes |
| `VITE_TURN_USERNAME` | TURN username | Yes |

## Secrets

| Name | Purpose | Set |
|------|---------|-----|
| `VITE_TURN_CREDENTIAL` | TURN password | Yes |
| `APPLE_API_KEY_P8` | Full contents of Team `AuthKey_4ZJVDMV9UZ.p8` (notarization) | Yes |
| `APPLE_API_KEY_ID` | `4ZJVDMV9UZ` — must match `.p8` filename | Yes |
| `APPLE_API_ISSUER` | App Store Connect Issuer UUID (Team key) | Yes |
| `CSC_LINK` | Base64 or raw `.p12` of **Developer ID Application** cert (CI code signing) | **No** — export manually from Keychain Access |
| `CSC_KEY_PASSWORD` | Password used when exporting `.p12` | **No** |

### CSC secrets (still manual)

CI macOS builds will **sign + notarize only when `CSC_LINK` exists**. Until then,
CI produces unsigned macOS artifacts; local `npm run electron:build` on your Mac
uses Keychain and works.

To finish CI signing:

1. Keychain Access → **Developer ID Application: …** → Export → `.p12`
2. `gh secret set CSC_LINK < path/to/export.p12`
3. `gh secret set CSC_KEY_PASSWORD --body "your-export-password"`

### Apple API key notes

- Use the **Team** key (`AuthKey_4ZJVDMV9UZ.p8`), not the Individual key
  (`AuthKey_87WU7WF5B6.p8` — notarization 401).
- Local `.env` mirrors `APPLE_API_KEY` (path), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.

## Workflows using these

| Workflow | Uses |
|----------|------|
| `.github/workflows/deploy.yml` | `VITE_MATCHMAKING_URL`, `VITE_TURN_*` |
| `.github/workflows/desktop-build.yml` | All above + Apple/CSC for macOS job |

See also: [`MACOS_SIGNING.md`](./MACOS_SIGNING.md), [`STEAM_M5_PACKAGING.md`](./STEAM_M5_PACKAGING.md).
