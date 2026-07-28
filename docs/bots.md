# Matchmaking bots

Headless players that sit in the online queue so a real player never picks
"Online" and finds nobody there. They also make a decent load test: every bot
drives the real auth, matchmaking, signaling and result-reporting paths.

Bots are **ordinary accounts**. They rank, they take and give Elo, they appear
on the daily and weekly boards. The one thing that makes them different is
matchmaking priority (below).

## Running them

```bash
npm run bots -- --count 8 --skill mixed
```

Needs two things, taken from flags, the environment, or `.env`:

| Setting | Flag | Env / `.env` |
| --- | --- | --- |
| Matchmaking URL | `--url` | `BOT_MM_URL`, else `VITE_MATCHMAKING_URL` |
| Shared secret | `--secret` | `BOT_SECRET` |
| REST origin (optional) | `--api` | `BOT_API_URL`, else derived from the URL |

Other flags: `--skill easy|normal|hard|brutal|mixed` (default `mixed`),
`--count`, `--stagger` (ms between starts), `--summary` (ms between status
lines), `--prefix` (account name prefix), `--verbose true`.

Against a local backend:

```bash
npm run bots -- --count 2 --url ws://127.0.0.1:8787/ws --skill hard
```

The supervisor prints one line per interval and restarts any bot that dies:

```
11:26:27  |  8 bots  |  queued 6  |  playing 2  |  dead 0  |  matches 14  |  wins 7  |  errors 0  |  avg wait 2s
```

Ctrl-C stops the fleet, giving each bot a moment to leave the queue cleanly.

## Server setup

The bots authenticate with a `bot` provider gated on a worker secret, so nobody
can self-declare as a bot:

```bash
cd server
npx wrangler secret put BOT_SECRET
npx wrangler d1 migrations apply robot-volley-db --remote
```

For local development put `BOT_SECRET=…` in `server/.dev.vars` and run
`npx wrangler d1 migrations apply robot-volley-db --local`.

Optional worker variable **`BOT_QUEUE_RESERVE`** (default 2) — how many bots to
keep sitting in the queue rather than pairing off. See "the reserve" below. Set
it to `0` when the point is to generate load rather than to cover players.

## Matchmaking priority

In `shared/pairing.js`, re-run every second while anyone is queued:

1. **Humans pair with humans first**, with no restriction.
2. **A human is only offered a bot after 5 seconds** (`HUMAN_BOT_GRACE_MS`).
   Without that pause the first human to queue is instantly taken by a bot and
   two humans who arrived seconds apart never meet.
3. **Bots pair with each other only when no human is queued at all** — not even
   one still inside their grace period, who will need a partner when it expires.
4. **The reserve**: bots never pair so completely that the queue empties.
   Otherwise an idle fleet consumes itself and a human arriving a second later
   finds every bot busy for the next few minutes, which is the exact failure
   this whole thing exists to prevent.

Geography still decides within each step, via the existing `chooseOpponent`.

Rules 1–3 are covered by `tests/pairing.test.js`.

## How a bot works

It runs the **shipping** netcode: `src/net/session.js` and `src/engine/game.js`
are imported unmodified, and the loop in `tools/bot/bot.mjs` mirrors the
browser's frame in `src/main.js` minus rendering. A bot that spoke its own
dialect would drift out of sync with the game and be worthless as a load test.

Only three things are substituted, through `src/net/config.js`:

- `WebSocket` — from `ws`.
- `RTCPeerConnection` — from `node-datachannel`'s polyfill.
- Credentials — each bot keeps its own, rather than the game's device secret.

Everything else is real: a bot is dealt seat 0 or 1 by the server like anyone
else, runs the authoritative simulation and streams snapshots when it is host,
consumes snapshots and sends input deltas when it is guest, and reports its
result for the server's dual-report check.

**One process per bot**, because the engine is a module-level singleton — one
ball, one pair of robots per module instance. `run.mjs` forks them.

### Credentials

Each bot stores a refresh token in `tools/bot/.credentials/<label>.json`
(gitignored), so a restarted fleet reclaims the same accounts instead of
littering the database with orphans. Delete the directory to start fresh.
Rotating `BOT_SECRET` also retires the old fleet's accounts.

### Skill

`tools/bot/brain.mjs` is deliberately separate from the 1P CPU (`aiControl` in
the engine), which is part of the game and is left alone. It differs in that it
knows the net exists when predicting the ball, aims its serve by solving for the
charge that lands where it wants, and simulates the orb sweep together with the
ball so it only swings when the swing will connect *and* drive the ball
downward — connecting near the top of the arc lobs it straight up.

`reactionMs` is the main difficulty knob: a weaker bot acts on a stale view of
the ball, so it still moves to the right place, just late. `mixed` (the default)
spreads bots across skill levels so players don't face a wall of identical
experts.

### Match length

Rallies in this game are long. The shipped CPU playing itself has a ~4 minute
median with a long tail, and the bots are comparable. `BOT_MATCH_TIMEOUT_MS`
(default 8 minutes) is the backstop that stops one pathological rally from
consuming a bot indefinitely; a bot that hits it abandons the match and requeues.

## Docker

`npm run bots:docker` builds the image locally for a quick smoke test —
useful while iterating on `tools/bot/`, but not how the fleet actually gets
deployed. That path is CI → GHCR → your server, below.

**Matchmaking is geography-first**, so one region of bots only covers players
near that region. Running a fleet in each region you have players in is the
point of packaging it this way.

## Deploying to a private server via GHCR

Pushing to `main` (when `src/`, `shared/`, or `tools/bot/` change) builds the
image in `.github/workflows/bots-image.yml` and publishes it to GitHub
Container Registry as `ghcr.io/gmussi/robot-volley-bots`. Your server only
ever pulls that image — it never needs the source tree or a build step.

### One-time setup

**1. Confirm the package is private.** GHCR's default for a freshly published
package has changed before, so don't take it on faith — after the workflow's
first successful run, check
https://github.com/users/gmussi/packages/container/robot-volley-bots/settings
and set **Danger Zone → Change visibility → Private** if it isn't already.

**2. Make a token the server can pull with.** GHCR needs a classic PAT (the
built-in `GITHUB_TOKEN` used inside the workflow doesn't work outside Actions):
[github.com/settings/tokens](https://github.com/settings/tokens) → **Generate
new token (classic)** → scope **`read:packages`** only → generate and copy it.

**3. On the server, log in once:**

```bash
echo <your-PAT> | docker login ghcr.io -u gmussi --password-stdin
```

Docker caches this credential, so it's a one-time step, not a per-pull one.

**4. Copy `tools/bot/docker-compose.server.yml`** to the server (it's
self-contained — nothing else from the repo is needed) and put your config
next to it in a `.env` file:

```bash
# .env, next to docker-compose.server.yml
BOT_MM_URL=wss://robot-volley-mm.gmussi.workers.dev/ws
BOT_SECRET=<the same value as the worker's BOT_SECRET>
BOT_COUNT=8
BOT_SKILL=mixed
```

**5. Start it:**

```bash
docker compose -f docker-compose.server.yml up -d
docker compose -f docker-compose.server.yml logs -f   # one JSON line per bot event
```

`restart: unless-stopped` in the compose file means it survives a server
reboot on its own.

### Updating after a new push

The server doesn't auto-update — pull and recreate when you want the new
image:

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

The credentials volume is untouched by this, so the fleet keeps its accounts
across updates. If you want this automatic, the standard tool for it is
[Watchtower](https://containrrr.dev/watchtower/) pointed at this one
container — not set up here, since a fleet that quietly restarts itself
mid-match is a tradeoff worth choosing deliberately, not defaulting into.
