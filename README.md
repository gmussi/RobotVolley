# Robot Volley

A 1v1 robot volleyball game inspired by classic slime-volley / ICQ volleyball.
Two customizable robot athletes rally a floaty ball over a net — first to **5 points**
wins the match.

## Play it

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. Pick **1 Player** (vs CPU) or **2 Players**, then
serve and rally.

## Game rules

### Objective

- Rally the ball over the net onto your opponent's floor.
- **First to 5 points wins** the match.
- If the ball touches the floor on the **left half**, **Player 2 scores**.
- If the ball touches the floor on the **right half**, **Player 1 scores**.
- After each point, the **loser serves** next.
- At the **start of a new match**, the first server is chosen **at random**.

### Court

- The arena is split by a **net** down the middle. Robots must stay on their own
  half at ground level (they cannot walk through the net post).
- Side **walls** bounce the ball back into play.
- There is **no ceiling** — the ball can fly into space above the screen. When it
  does, a **ghost tracker** (transparent ball + upward arrow) appears at the top
  edge, sliding horizontally to show where the ball is.

### Serving

- Before each rally, the server **holds** their serve key to **charge** force into
  the ball, then **releases** to launch.
- A longer charge means a faster, more aggressive serve (up to a 4-second full charge).
- The ball hovers above the server's head during the serve phase and follows them
  if they jump.

### Hitting the ball

- Robots hit the ball with their body (ICQ / slime-volley feel): **position and
  movement control the ball**, not supercharged power hits.
- **A grounded touch** **cushions** the ball (slows it down so you can redirect).
  A ball **falling onto the top of the head** pops upward (with a minimum bounce
  to keep rallies alive) and only deflects sideways when you hit off-center or
  are moving — standing still under a drop sends it mostly back up.
- A **jumping** touch adds a small pop.
- Each touch can add only a limited amount of speed — rallies build pace gradually
  rather than exploding on a single hit.

### Controls

| | Player 1 | Player 2 |
|---|----------|----------|
| Move left | `A` | `←` |
| Move right | `D` | `→` |
| Jump | `W` | `↑` |
| Serve (hold) | `S` | `↓` |

- **Space** — return to menu after a match ends.
- **1 / 2** or click menu cards — pick game mode.

In **1 Player** mode, Player 2 is a CPU opponent.

### Customization

Before or during a match, customize each robot:

| Option | Effect |
|--------|--------|
| **Head / Torso / Arms / Legs colors** | Per-part color pickers |
| **Robot legs** | Normal jump — blocky legs with knee joint |
| **Power legs** | Higher jump — thick hydraulic legs with gold springs and wide boots |
| **Rocket legs** | Up to 3 flaps per ground touch — slim struts with thruster nozzles and flame bursts |

## Development

```
npm run dev          # dev server with hot reload (Vite)
npm test             # run tests
npm run build        # production build → dist/
npm run preview      # serve production build locally
npm run genart       # procedural SVG baselines
npm run genart:ai    # Gemini-painted WebP upgrades (needs GEMINI_API_KEY)
```

### Project structure

```
src/
  data/       constants, controls — pure data, no engine/ui imports
  engine/     game rules, physics, AI — no DOM or canvas
  ui/         canvas renderer, DOM panels, art loader
  styles/     CSS
  assets/     SVG baselines + optional Gemini WebPs
tools/
  genart.py           procedural SVG generator
  gen_nanobanana.py   Gemini image generator → WebP
legacy/               pre-refactor single-file prototypes
```

**Architecture rule:** `engine/` never imports from `ui/`. Only `src/main.js`
wires engine and renderer together.

See [`tools/ART_PIPELINE.md`](./tools/ART_PIPELINE.md) for the Gemini art workflow.

## Deploying

Pushing to `main` runs tests, builds, and deploys to GitHub Pages automatically
(see [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)). Enable
Pages under **Settings → Pages → Build and deployment → GitHub Actions** once.

Live site: **https://gmussi.github.io/RobotVolley/**

### Art generation

Add `GEMINI_API_KEY=...` to a `.env` file at the project root (gitignored):

```bash
pip install google-genai pillow numpy
npm run genart        # SVG fallbacks (no API key needed)
npm run genart:ai     # painted WebPs via Gemini
```

## Changelog

- **v0.1.0** — Restructured into Vite modular project; ball can leave the arena
  upward with off-screen horizontal tracker; Gemini art pipeline for arena backdrop
  and logo.
