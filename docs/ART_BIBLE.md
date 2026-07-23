# Robot Volley — Art Bible

> **North star:** Two sleek neon athletes rally a glowing volleyball in a futuristic night stadium — fast, readable, and fun at a glance.

## Visual Identity

| Dimension | Direction |
|-----------|-----------|
| Genre feel | Casual competitive arcade volleyball |
| Setting | Neon sci-fi sports arena at night |
| Tone | Energetic, accessible, playful competition |
| References (mood, not copies) | TRON arena energy, Rocket League readability, Fall Guys accessibility |

## Color System

All UI and canvas code should import tokens from `src/data/theme.js`.

| Token | Hex / value | Usage |
|-------|-------------|-------|
| `bg` | `#0a0e1a` | Page background, deep scrims |
| `bgDeep` | `#060912` | Canvas fallback, loading screen |
| `surface` | `#121828` | Glass panel fill |
| `surfaceBorder` | `rgba(255,255,255,0.12)` | Panel edges |
| `text` | `#f5f7ff` | Primary copy |
| `textMuted` | `#9aa4c0` | Hints, secondary labels |
| `p1` | `#ff5a5f` | Player 1 team color |
| `p1Dark` | `#b02a2f` | P1 limbs, shadows |
| `p2` | `#29b6f6` | Player 2 team color |
| `p2Dark` | `#1565a8` | P2 limbs, shadows |
| `accent` | `#ffd54a` | Ball, selection, score emphasis |
| `accentLight` | `#fff3c0` | Logo gradient top |
| `accentDark` | `#f2b705` | Logo gradient bottom |
| `net` | `#e0e0e0` | Net mesh |
| `lottery` | `#c084fc` | Lottery accent (neutral from teams) |

### Glow variants

Use sparingly — one glow layer per element, never stacked bloom.

| Token | Value | Usage |
|-------|-------|-------|
| `glowP1` | `rgba(255,90,95,0.45)` | P1 halos, selection accents |
| `glowP2` | `rgba(41,182,246,0.45)` | P2 halos |
| `glowAccent` | `rgba(255,213,74,0.55)` | Ball, menu selection |
| `glowSurface` | `rgba(18,24,40,0.85)` | Glass panel backdrop |

### Colorblind accessibility

When `colorblindMode` is enabled:
- P1 score/tag gets diagonal stripe hatch overlay
- P2 score/tag gets dot pattern overlay
- Never rely on red/blue alone for critical game state

## Typography

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display / UI | Rajdhani | 600–700 | Menus, HUD, scoreboard, titles |
| Body / hints | Inter | 400–500 | Control hints, descriptions, settings labels |

**Do not use:** Courier New, pixel fonts, or system-only stacks for in-game UI.

Letter-spacing for menu items: `3px` (display), `0` for body.

## Logo Usage

- **Primary:** Painted `logo.webp` on title screen (560×160 logical px)
- **Fallback:** `logo.svg` wordmark with gold gradient + circuit volleyball marks
- **Icon mark:** Volleyball with circuit arcs — used at 32×32 favicon through 512×512 app icon
- **Clear space:** Minimum padding = height of the "O" in ROBOT on all sides
- **Backgrounds:** Always on dark navy (`#0a0e1a`) or over stadium with 60%+ scrim

## UI Language — Glass Neon Panels

Every overlay screen (menu, pause, settings, controls, lottery, match over) shares:

1. **Semi-transparent scrim** — `rgba(6,9,18,0.55)` max; stadium visible behind
2. **Glass card** — `surface` fill at 85% opacity, 1px `surfaceBorder`, 12px radius
3. **Neon border on selection** — 2px `accent` with soft outer glow
4. **No CRT scanlines** — retired; unified neon broadcast aesthetic

### HUD

- Floating glass scorebar centered top
- Circular neon cooldown gauges (not rectangles)
- Team-colored dividers between scores

## Character Design — Robots

Procedural canvas drawing (no sprite sheets). All parts share:

- **Silhouette:** Athletic stance, tapered limbs, readable at lottery thumbnail size
- **Material:** Metallic base fill + neon rim light on lit edges
- **Team glow:** Subtle colored halo matching player side

### Part accent colors (head variants)

| Part | Accent |
|------|--------|
| Standard | Team color |
| Dome | `#7dd3fc` (ice blue) |
| Magnet | `#c084fc` (purple) |
| Drill | `#fb923c` (orange) |
| Satellite | `#4ade80` (green) |

## Environment

- Layered stadium WebPs: sky → stadium → court
- Procedural net renders on top (never baked into background)
- Center-court spotlight — robots must read clearly against floor
- Ambient animation: slow sky pulse (4s), synchronized neon flicker (2s)

## Iconography

Neon-outline style, 1.5px stroke, no fill. Used for: music, SFX, fullscreen, attack, serve, lottery.

## Do / Don't

| Do | Don't |
|----|-------|
| Keep one visual language end-to-end | Mix retro CRT with modern neon |
| Use theme tokens everywhere | Hard-code hex in new code |
| Let stadium show through overlays | Opaque black fullscreen menus |
| Glow one layer at a time | Stack multiple shadowBlur passes |
| Test at 1000×600 and mobile portrait | Design only for desktop |

## Asset Pipeline

| Layer | Tool | Output |
|-------|------|--------|
| Baseline | `npm run genart` | SVG |
| Painted | `npm run genart:ai` | WebP via Gemini |
| Icons | `python3 tools/export_icons.py` | PNG/ICO set |
| Stadium | `npm run genart:stadium` | Layered WebPs |

Style anchor: `tools/style_ref.png` — neon sci-fi sports broadcast, no CRT/pixel aesthetic.

## Store & Marketing

- **Tagline:** Rally. Customize. Smash.
- **Key art:** 1920×1080, two robots mid-rally, logo top-center
- **Public copy:** "Classic arcade volleyball feel" — avoid "ICQ volleyball" jargon
