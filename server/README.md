# Robot Volley — account & matchmaking service

One Cloudflare Worker doing two jobs:

- **Accounts, stats, unlocks and leaderboards** — stateless HTTP over **D1**. These
  need cross-player queries and must survive restarts.
- **Matchmaking + WebRTC signaling** — a single global **Durable Object** holding
  live sockets. Game traffic itself never touches the server; it is peer-to-peer.

## Identity model

The point of the schema is the split between `accounts` (the progression: name,
stats, unlocks, rank) and `identities` (one row per platform the account can be
proved from). Adding PlayStation, Xbox, Nintendo or an app store later is a new
file in `src/auth/providers/` plus a line in its registry — **no schema change,
no migration, no backfill**. Two providers exist today:

| provider | ticket | verified by |
|---|---|---|
| `device` | a random secret the client generates on first run | its SHA-256 is the identity key; the secret itself is never stored |
| `steam`  | a Steamworks session ticket (hex) | `ISteamUserAuth/AuthenticateUserTicket` |

Cross-device progression works through **link codes**: mint one on a signed-in
device (`POST /auth/link-code`), redeem it on another (`POST /auth/redeem-link-code`),
and the second device's identity joins the first account. If that identity already
belongs to a *different* account the request is refused rather than merged —
merging two progression histories is ambiguous and would destroy one of them.

## First-time setup

```bash
cd server
npm install
npx wrangler d1 create robot-volley-db     # paste the id into wrangler.toml
npm run migrate:local                      # or migrate:remote for production
cp .dev.vars.example .dev.vars             # local secrets, gitignored
```

Production secrets are set out of band and never committed:

```bash
npx wrangler secret put JWT_SIGNING_KEY
npx wrangler secret put DEVICE_SIGNING_KEY
npx wrangler secret put STEAM_WEB_API_KEY
npx wrangler secret put STEAM_APP_ID
```

`JWT_SIGNING_KEY` and `DEVICE_SIGNING_KEY` are deliberately separate so leaking
one cannot mint the other. Without the Steam pair the Steam provider reports
unavailable rather than trusting tickets — a misconfigured deploy cannot be used
to forge a Steam identity.

## Running locally

**Most of the time you don't need to.** `.env` points the game at the deployed
Worker, so a plain `npm run dev` in the project root is the whole setup — no
second terminal, nothing to remember. Client work (UI, rendering, game feel)
never needs a local Worker.

Run one only when you are changing this directory:

| Situation | Why local |
|---|---|
| Editing `server/src/**` | A deploy is ~20s per iteration; local reload is instant |
| Adding or editing a migration | A bad migration against the real D1 is painful to undo. Locally you delete `.wrangler/state` and start over |
| Anything that writes test data | Smoke tests create real accounts and put real rows on the live leaderboard |

The last one is the real reason, not deploy speed. When you do want it:

```bash
cp .env.local.example .env.local    # point the game at 127.0.0.1:8788
cd server && npm run dev            # terminal 1 — the Worker
npm run dev                         # terminal 2 — the game
```

Delete `.env.local` to go back to the deployed matchmaker.

> Once there are real players, the better answer than a local Worker is a
> **second deployed environment**: add an `[env.staging]` block to
> `wrangler.toml` with its own D1 binding and `wrangler deploy --env staging`.
> That keeps test accounts off the live boards without running anything locally.

The `dev` script pins `--compatibility-date=2026-05-03` because the newest
wrangler that still supports Node 20 ships a runtime that does not know the
production date in `wrangler.toml`. Production is unaffected. Once the toolchain
is on Node 22, drop the flag and unpin `wrangler` in `package.json`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | — | platform ticket → session; creates the account on first call |
| POST | `/auth/refresh` | — | refresh token → new session |
| POST | `/auth/link` | JWT | attach another platform to this account |
| POST | `/auth/link-code` | JWT | mint a 10-minute transfer code |
| POST | `/auth/redeem-link-code` | — | join an account from a new device |
| GET | `/me` | JWT | name, stats, unlocks, loadout in one round trip |
| PUT | `/me/name` | JWT | rename (unique, filtered, once per 7 days) |
| PUT | `/me/loadout` | JWT | equip cosmetics; **locked items are refused here** |
| GET | `/leaderboard?period=daily\|weekly` | optional | top 50 plus the caller's own row |
| GET | `/ws` | JWT via first frame | matchmaking + signaling |

## Trust model

Nothing the client says about a match is believed on its own.

- The **socket authenticates** before it may queue, so results attach to an
  account and display names are vouched for by the server rather than claimed by
  the peer.
- Match results are **dual-reported**: each peer sends its own view over the
  matchmaking socket and the result is recorded only when the two agree. A
  disagreement is discarded and counted against both accounts; a replay of a
  settled match is a no-op (the `matches` row is keyed by room id); an
  implausible score never reaches the cross-check at all.
- **Unlocks are derived server-side** from stats, and equipping is re-validated,
  so the greyed-out tile in the Profile screen is presentation only.

This stops casual tampering. It does not stop two players who agree to lie to
each other's benefit — catching that needs replay verification, which is out of
scope by design.

## Leaderboard periods

Boards reset by *starting a new key* (`d:2026-07-27`, `w:2026-W31`), never by
deleting rows: a rollover is just the first write of the day landing under
tomorrow's key. No scheduled job, no downtime, and every past period stays
queryable. Keys are UTC and the server returns `resetsAt` with each response, so
the client's countdown is right in every timezone and immune to a wrong device
clock.

Period and ranking maths live in `shared/` and are imported by both the Worker
and the game, so the countdown, the unlock progress bar and the server's
authority can never disagree.
