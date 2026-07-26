# Legal documents — Robot Volley

Templates for Steam store compliance. **Not legal advice** — have a lawyer review
before launch if you are selling commercially.

## Publisher details (filled in)

| Field          | Value                      |
| -------------- | -------------------------- |
| Publisher      | G. P. S. MUSSI LTDA        |
| Contact        | contact@guilhermemussi.com |
| Effective date | July 26, 2026              |
| Governing law  | Brazil                     |

Use **G. P. S. MUSSI LTDA** as Developer and Publisher on the Steam store page.

Optional: add your CNPJ and business address to the Privacy Policy contact section
for LGPD transparency.

## Files

| File                                                                 | Purpose                        |
| -------------------------------------------------------------------- | ------------------------------ |
| [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md)                           | Source markdown (easy to edit) |
| [`EULA.md`](./EULA.md)                                               | Source markdown                |
| [`../../public/legal/privacy.html`](../../public/legal/privacy.html) | Hosted page (GitHub Pages)     |
| [`../../public/legal/eula.html`](../../public/legal/eula.html)       | Hosted page                    |

Edit the `.md` files first, then sync the matching sections into the `.html` files
(or regenerate HTML later).

## Steam store URLs

After you push to `main`, GitHub Pages serves the built site from `dist/`. Legal
pages live under `public/legal/` and copy into the build automatically.

**Privacy Policy URL (Steam “Privacy Policy” field):**

```
https://gmussi.github.io/RobotVolley/legal/privacy.html
```

**EULA URL (Steam “Support / Legal” or custom EULA field):**

```
https://gmussi.github.io/RobotVolley/legal/eula.html
```

If you use a custom domain later, update these URLs in Steamworks.

## What these documents cover

Based on the actual Robot Volley codebase:

- **Local save data** — settings, controls, achievements (`robotvolley_*` keys)
- **Steam** (desktop, when launched via Steam) — achievements, optional Cloud save
- **Online multiplayer** — Cloudflare Workers matchmaker (approximate geo only,
  in-memory sessions), WebRTC peer-to-peer game data, optional Metered.ca TURN
  relay, Google public STUN
- **No analytics SDK**, no accounts, no ads

See also: [`../STEAM_M5_PACKAGING.md`](../STEAM_M5_PACKAGING.md) Step 6.
