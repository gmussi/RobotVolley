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
| `CSC_LINK` | Base64-encoded `.p12` of **Developer ID Application** cert | Yes |
| `CSC_KEY_PASSWORD` | Password used when exporting `.p12` | Yes |

### CSC secrets

Configured 2026-07-26. **Important:** `CSC_LINK` must be **base64 text**, not the raw
`.p12` binary. GitHub rejects non–UTF-8 secrets and the workflow fails at startup with:

> The secret CSC_LINK referenced by this workflow is not properly UTF-8 encoded

Re-set from your Mac:

```bash
base64 -i ~/path/to/DeveloperID.p12 | gh secret set CSC_LINK --repo gmussi/RobotVolley
gh secret set CSC_KEY_PASSWORD --repo gmussi/RobotVolley
```

CI macOS job produces signed + notarized artifacts when `desktop-build.yml` runs on
`macos-latest`.

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
