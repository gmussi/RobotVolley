#!/usr/bin/env python3
"""
Robot Volley — blink spritesheets for every head variant, both teams.

A blink only needs THREE unique frames (open / mid / closed); the game plays them
0,1,2,1,0 so a 5-step blink costs 3 frames of art instead of 10. Frames are
generated procedurally from the finished head art (the lit region is detected by
color and covered with lids sampled from the surrounding bezel), so every frame
stays pixel-identical apart from the eye.

Output: src/assets/robot/anim/<team>/head-<variant>.webp
        one horizontal strip, 3 equal frames, transparent.

    python3 tools/robot/gen_blink_sheets.py
"""
import glob
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SETS = {
    "p1": os.path.join(ROOT, "src", "assets", "robot", "parts"),
    "p2": os.path.join(ROOT, "src", "assets", "robot", "parts-p2"),
}
DST_ROOT = os.path.join(ROOT, "src", "assets", "robot", "anim")
FRAME_MAX = 256          # heads render ~115px tall; 256 is ample
OPEN, MID, CLOSED = 1.0, 0.45, 0.10


def visor_mask(im):
    """
    The lit eye/visor: bright, saturated, and NOT the armor's red/blue body.
    Catches cyan visors, the drill's orange lens, and the magnet's eye bar.
    """
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    bright = (al > 60) & (mx > 140) & (sat > 0.30)
    # exclude body armor: crimson (r dominant) and team blue (b dominant, low g)
    armor_red = (r > g * 1.25) & (r > b * 1.15)
    armor_blue = (b > r * 1.25) & (b > g * 1.20)
    lit = bright & ~armor_red & ~armor_blue
    # keep only the widest horizontal band (the visor), drop antenna dots etc.
    rows = lit.sum(axis=1)
    if rows.max() < 4:
        return lit
    cy = int(np.argmax(rows))
    h = lit.shape[0]
    band = np.zeros_like(lit)
    lo, hi = max(0, cy - h // 6), min(h, cy + h // 6)
    band[lo:hi] = True
    return lit & band


def close_eye(im, mask, open_frac):
    """Cover the lit region top & bottom with bezel-colored lids."""
    if open_frac >= 0.999:
        return im.copy()
    ys, xs = np.where(mask)
    if not len(ys):
        return im.copy()
    y0, y1 = ys.min(), ys.max() + 1
    a = np.asarray(im.convert("RGBA")).copy()
    # bezel color sampled just above the lit band, on the same columns
    sy = max(0, y0 - 3)
    sample = a[sy, xs.min():xs.max() + 1][:, :3]
    bezel = np.median(sample, axis=0).astype(np.uint8)

    span = y1 - y0
    slit = max(1, int(round(span * open_frac)))
    cy = (y0 + y1) // 2
    top, bot = cy - slit // 2, cy + slit // 2
    yy = np.arange(a.shape[0])[:, None]
    lid = mask & ((yy < top) | (yy > bot))
    a[lid, 0], a[lid, 1], a[lid, 2] = bezel[0], bezel[1], bezel[2]
    return Image.fromarray(a, "RGBA")


def build_strip(path_in, path_out):
    im = Image.open(path_in).convert("RGBA")
    s = min(1.0, FRAME_MAX / max(im.size))
    if s < 1.0:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    mask = visor_mask(im)
    frames = [close_eye(im, mask, f) for f in (OPEN, MID, CLOSED)]
    w, h = im.size
    strip = Image.new("RGBA", (w * 3, h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.alpha_composite(f, (i * w, 0))
    strip.save(path_out, "WEBP", quality=88, method=6)
    return int(mask.sum()), strip.size


def main():
    total = 0
    for team, src_dir in SETS.items():
        dst = os.path.join(DST_ROOT, team)
        os.makedirs(dst, exist_ok=True)
        for p in sorted(glob.glob(os.path.join(src_dir, "head-*.webp"))):
            name = os.path.basename(p)
            out = os.path.join(dst, name)
            px, size = build_strip(p, out)
            total += os.path.getsize(out)
            print(f"  {team}/{name:22s} lit px {px:6d}  strip {size[0]}x{size[1]}")
    print(f"Total blink sheets: {total // 1024} KB -> {os.path.relpath(DST_ROOT, ROOT)}")


if __name__ == "__main__":
    main()
