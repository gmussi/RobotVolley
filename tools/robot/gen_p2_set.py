#!/usr/bin/env python3
"""
Robot Volley — bake the P2 (blue team) part set from the P1 (crimson) parts.

Why a baked set instead of a runtime tint: identical geometry to P1 (both teams
MUST read as the same character for fair readability), precise color control, and
zero per-frame/per-load pixel work in the browser.

Works in HSV and moves ONLY the red armor family toward the team blue (#29b6f6,
hue ~199 deg). Cyan visor/core (~185), gold trim (~45), and low-saturation silver
joints are left untouched — which a global hue-rotate cannot do.

    python3 tools/robot/gen_p2_set.py
"""
import colorsys
import glob
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SRC = os.path.join(ROOT, "src", "assets", "robot", "parts")
DST = os.path.join(ROOT, "src", "assets", "robot", "parts-p2")

TARGET = 205.0 / 360.0   # team blue, a touch deeper than #29b6f6 so it reads on dark
SPREAD = 0.30            # how much of the armor's own hue variation to keep
MIN_SAT = 0.10           # below this it's silver / near-black bezel — leave alone

# Accents are protected by their ORIGINAL hue, which is unambiguous: the red
# armor family lives at >300deg or <25deg, and nothing else does. Everything in
# between (gold trim ~45, satellite green ~145, cyan glow ~185, magnet purple
# ~285) is left exactly as painted.
RED_LO = 300.0 / 360.0
RED_HI = 25.0 / 360.0


def hue_delta(h, center):
    """Signed shortest distance from center on the hue circle, in turns."""
    return (h - center + 0.5) % 1.0 - 0.5


def recolor(path_in, path_out):
    im = Image.open(path_in).convert("RGBA")
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    v = mx
    diff = mx - mn
    s = np.where(mx > 0, diff / np.maximum(mx, 1e-6), 0)

    # hue (in turns)
    h = np.zeros_like(mx)
    nz = diff > 1e-6
    rm = nz & (mx == r)
    gm = nz & (mx == g) & ~rm
    bm = nz & (mx == b) & ~rm & ~gm
    h[rm] = ((g[rm] - b[rm]) / diff[rm]) % 6.0
    h[gm] = (b[gm] - r[gm]) / diff[gm] + 2.0
    h[bm] = (r[bm] - g[bm]) / diff[bm] + 4.0
    h = (h / 6.0) % 1.0

    armor = ((h >= RED_LO) | (h <= RED_HI)) & (s >= MIN_SAT) & (alpha > 0.02)

    # Collapse the armor onto the target blue, keeping only a fraction of its own
    # hue spread. Preserving the full spread amplifies WebP hue noise and comes
    # out blotchy; compressing it gives one consistent team color.
    d = hue_delta(h, 0.0)          # distance from pure red, wraps cleanly
    h_new = h.copy()
    h_new[armor] = (TARGET + d[armor] * SPREAD) % 1.0

    # Blue reads darker and flatter than crimson at equal V — lift it slightly.
    v_new, s_new = v.copy(), s.copy()
    v_new[armor] = np.clip(v[armor] * 1.08 + 0.02, 0, 1)
    s_new[armor] = np.clip(s[armor] * 1.55 + 0.10, 0, 1)

    hsv_to_rgb = np.vectorize(colorsys.hsv_to_rgb)
    nr, ng, nb = hsv_to_rgb(h_new, s_new, v_new)
    out = np.dstack([nr, ng, nb, alpha])
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA").save(
        path_out, "WEBP", quality=88, method=6
    )
    return int(armor.sum())


def main():
    os.makedirs(DST, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC, "*.webp")))
    if not files:
        raise SystemExit(f"no source parts in {SRC}")
    for p in files:
        name = os.path.basename(p)
        n = recolor(p, os.path.join(DST, name))
        print(f"  {name:28s} armor px recolored: {n}")
    print(f"Wrote {len(files)} P2 parts -> {os.path.relpath(DST, ROOT)}")


if __name__ == "__main__":
    main()
