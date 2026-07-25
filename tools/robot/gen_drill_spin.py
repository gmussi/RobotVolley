#!/usr/bin/env python3
"""
Robot Volley — spinning drill-head spritesheets for both teams.

The cone's high-frequency detail (spiral flutes, hazard accents) is scrolled
with a cylindrical wrap while low-frequency shading stays put, so the baked
light side doesn't orbit with the bit. The housing + visor below the cone are
left untouched.

Output: src/assets/robot/anim/<team>/head-drill-spin.webp
        one horizontal strip, SPIN_FRAMES equal frames, transparent.

    python3 tools/robot/gen_drill_spin.py
"""
import glob
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SETS = {
    "p1": os.path.join(ROOT, "src", "assets", "robot", "parts"),
    "p2": os.path.join(ROOT, "src", "assets", "robot", "parts-p2"),
}
DST_ROOT = os.path.join(ROOT, "src", "assets", "robot", "anim")
FRAME_MAX = 256
SPIN_FRAMES = 8
PITCH = 1.15          # spiral turns tip→base over one revolution
BLUR_RADIUS = 7       # separates shading (low) from flutes/accents (high)


def visor_top(a):
    """
    Top Y of the teal visor panel. Strict teal (not generic "lit") so the
    cone's orange hazard accents and P2 blue metal don't pull the cut up.
    """
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    teal = (al > 200) & (g > 180) & (b > 160) & (r < 100) & (g > r * 2)
    ys = np.where(teal)[0]
    if len(ys) >= 8:
        return int(ys.min())
    # Fallback: densest lit horizontal band (same idea as blink sheets).
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    bright = (al > 60) & (mx > 140) & (sat > 0.30)
    armor_red = (r > g * 1.25) & (r > b * 1.15)
    armor_blue = (b > r * 1.25) & (b > g * 1.20)
    lit = bright & ~armor_red & ~armor_blue
    rows = lit.sum(axis=1)
    if rows.max() < 4:
        opaque = np.where(al > 20)[0]
        return int(opaque.min() + (opaque.max() - opaque.min()) * 0.55)
    cy = int(np.argmax(rows))
    thresh = rows[cy] * 0.45
    lo = cy
    while lo > 0 and rows[lo - 1] >= thresh:
        lo -= 1
    return lo


def row_bounds(alpha):
    h, w = alpha.shape
    left = np.full(h, -1, dtype=int)
    right = np.full(h, -1, dtype=int)
    opaque = alpha > 20
    for y in range(h):
        xs = np.where(opaque[y])[0]
        if len(xs):
            left[y] = int(xs[0])
            right[y] = int(xs[-1]) + 1
    return left, right


def spin_frame(rgb, blur, detail, alpha, left, right, cone_end, phase):
    out_rgb = rgb.copy()
    for y in range(cone_end):
        L, R = left[y], right[y]
        if L < 0 or R - L < 4:
            continue
        width = R - L
        spiral = (y / max(1, cone_end - 1)) * PITCH
        xs = np.arange(L, R)
        frac = (xs - L) / width
        src_frac = (frac - phase - spiral) % 1.0
        src_x = L + src_frac * (width - 1)
        x0 = np.floor(src_x).astype(int)
        x1 = np.minimum(x0 + 1, R - 1)
        f = (src_x - x0)[:, None]
        d = detail[y, x0] * (1 - f) + detail[y, x1] * f
        out_rgb[y, L:R] = np.clip(blur[y, L:R] + d, 0, 255)
    return np.dstack([out_rgb, alpha]).astype(np.uint8)


def build_strip(path_in, path_out):
    im = Image.open(path_in).convert("RGBA")
    s = min(1.0, FRAME_MAX / max(im.size))
    if s < 1.0:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)

    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3]
    rgb = a[..., :3]
    blur = np.asarray(
        im.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS)).convert("RGBA")
    ).astype(np.float32)[..., :3]
    detail = rgb - blur
    cone_end = max(0, visor_top(a) - 4)
    left, right = row_bounds(alpha)

    frames = []
    for i in range(SPIN_FRAMES):
        phase = i / SPIN_FRAMES
        pix = spin_frame(rgb, blur, detail, alpha, left, right, cone_end, phase)
        frames.append(Image.fromarray(pix))

    w, h = im.size
    strip = Image.new("RGBA", (w * SPIN_FRAMES, h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.alpha_composite(f, (i * w, 0))
    strip.save(path_out, "WEBP", quality=88, method=6)
    return cone_end, strip.size


def main():
    total = 0
    for team, src_dir in SETS.items():
        dst = os.path.join(DST_ROOT, team)
        os.makedirs(dst, exist_ok=True)
        src = os.path.join(src_dir, "head-drill.webp")
        if not os.path.isfile(src):
            print(f"  skip {team}: no head-drill.webp")
            continue
        out = os.path.join(dst, "head-drill-spin.webp")
        cone_end, size = build_strip(src, out)
        total += os.path.getsize(out)
        print(f"  {team}/head-drill-spin.webp  cone_end={cone_end:3d}  strip {size[0]}x{size[1]}")
    print(f"Total spin sheets: {total // 1024} KB -> {os.path.relpath(DST_ROOT, ROOT)}")


if __name__ == "__main__":
    main()
