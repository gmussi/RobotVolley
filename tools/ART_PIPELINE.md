# Art pipeline

Robot Volley uses a **two-layer art system**:

| Layer | Tool | Output | When used |
|-------|------|--------|-----------|
| Baseline | `tools/genart.py` | `src/assets/**/*.svg` | Always present; deterministic |
| Painted | `tools/gen_nanobanana.py` | `src/assets/**/*.webp` | Preferred by `src/ui/art.js` when file exists |

## Setup

```bash
pip install google-genai pillow numpy
```

Add your API key to **`.env`** at the project root (or `tools/.env`):

```
GEMINI_API_KEY=your_key_here
```

Get a key at [Google AI Studio](https://aistudio.google.com/apikey). Image generation requires a billing-enabled Gemini project.

## Commands

```bash
npm run genart          # procedural SVG baselines
npm run genart:ai       # Gemini-painted WebPs (missing only)
python3 tools/gen_nanobanana.py --force     # regenerate all
python3 tools/gen_nanobanana.py --only logo # single asset
python3 tools/gen_nanobanana.py --restyle   # new style anchor
python3 tools/gen_stadium_layers.py           # stadium layer stack from tools/refs/stadium.png
python3 tools/gen_stadium_layers.py --force   # regenerate all stadium layers
```

## Assets

| File | Purpose |
|------|---------|
| `src/assets/bg/arena.webp` | Full-canvas arena backdrop (1000×600) |
| `src/assets/bg/stadium-*.webp` | Layered neon-stadium backdrop (see below) |
| `src/assets/logo.webp` | Title-screen logo (chroma-keyed cutout) |

The style anchor is cached at `tools/style_ref.png` (gitignored) and passed as a reference image on every generation call for visual cohesion.

## Stadium layered backdrop

Place a master composition at `tools/refs/stadium.png`, then:

```bash
npm run genart:stadium
```

This writes aligned RGBA layers to `src/assets/bg/`:

| File | Content |
|------|---------|
| `stadium-master.webp` | Full scene fallback |
| `stadium-sky.webp` | Sky, stars, distant city |
| `stadium-stadium.webp` | Seating, billboards, interior fog (no net) |
| `stadium-court.webp` | Court floor and reflections |

The game draws layers back-to-front in `drawStadiumArena()` with subtle sky pulse, neon flicker, and drifting fog. The procedural net in `drawNet()` renders on top.

## Adding new assets

1. Add an SVG baseline in `tools/genart.py`.
2. Register the asset in `tools/gen_nanobanana.py` `ASSETS` list.
3. Wire the loader in `src/ui/art.js`.
4. Update this file and `README.md`.
