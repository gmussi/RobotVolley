#!/usr/bin/env python3
"""
Robot Volley — animation spritesheets for the flat-vector part set.

The parts are static PNGs; their GLOWING elements (cyan visor-eye, chest core) are
animated PROCEDURALLY so every frame stays pixel-identical except the light. This
is the correct way to build clean loop spritesheets — no model jitter.

Outputs (in refs/parts-flatvector/anim/):
  head-standard__visor-blink.png   horizontal spritesheet strip (transparent)
  torso-standard__core-pulse.png   horizontal spritesheet strip (transparent)
  _visor-blink.gif / _core-pulse.gif   preview loops on dark bg
  _robot-idle.gif                  full assembled robot idling (blink + pulse)

    python3 tools/robot/gen_anim.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_roster as gr  # noqa: E402  (skeleton place()/LAYOUT/assemble helpers)

PARTS = os.path.join(HERE, "refs", "parts-flatvector")
OUT = os.path.join(PARTS, "anim")
BG = (10, 14, 26, 255)


# ---------------------------------------------------------------- cyan detection
def cyan_mask(im, yband=None, xband=None):
    """Boolean mask of the glowing cyan pixels; optionally restricted to a band."""
    a = np.asarray(im.convert("RGBA")).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = (al > 40) & (g > 120) & (b > 120) & (r < g * 0.78) & (r < b * 0.78)
    h, w = m.shape
    if yband:
        yy = np.arange(h)[:, None]
        m &= (yy >= yband[0] * h) & (yy <= yband[1] * h)
    if xband:
        xx = np.arange(w)[None, :]
        m &= (xx >= xband[0] * w) & (xx <= xband[1] * w)
    return m


def bbox(mask):
    ys, xs = np.where(mask)
    if not len(ys):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# ------------------------------------------------------------------ glow helpers
def apply_glow(base, mask, brightness, halo, radius=9):
    """Return base with the masked (cyan) pixels brightened + an additive halo."""
    frame = base.copy()

    # 1) brighten/dim the core pixels themselves
    box = bbox(mask)
    if box:
        crop = frame.crop(box)
        crop = ImageEnhance.Brightness(crop).enhance(brightness)
        mimg = Image.fromarray((mask[box[1]:box[3], box[0]:box[2]] * 255).astype("uint8"))
        frame.paste(crop, box, mimg)

    # 2) additive neon halo around the lit pixels
    if halo > 0:
        a = np.zeros((*mask.shape, 4), dtype="uint8")
        a[mask] = (150, 240, 255, 255)
        glow = Image.fromarray(a).filter(ImageFilter.GaussianBlur(radius))
        glow = ImageEnhance.Brightness(glow.convert("RGB")).enhance(halo)
        rgb = ImageChops.add(frame.convert("RGB"), glow)
        frame = Image.merge("RGBA", (*rgb.split(), frame.split()[3]))
    return frame


def blink_visor(base, mask, open_frac):
    """Close the visor to a slit of height open_frac by covering top/bottom with bezel."""
    box = bbox(mask)
    if not box or open_frac >= 0.999:
        return apply_glow(base, mask, 1.15, 0.9)
    x0, y0, x1, y1 = box
    # bezel color = sampled just above the visor
    a = np.asarray(base.convert("RGBA"))
    sy = max(0, y0 - 4)
    bez = tuple(int(v) for v in a[sy, (x0 + x1) // 2][:3]) + (255,)
    frame = base.copy()
    h = y1 - y0
    slit = max(2, int(h * open_frac))
    cy = (y0 + y1) // 2
    top, bot = cy - slit // 2, cy + slit // 2
    lid = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = np.zeros((*mask.shape, 4), dtype="uint8")
    cover = mask.copy()
    yy = np.arange(mask.shape[0])[:, None]
    cover &= (yy < top) | (yy > bot)          # only the lid area, on cyan pixels
    d[cover] = bez
    lid = Image.fromarray(d)
    frame.alpha_composite(lid)
    # faint glow scales with how open the eye is
    return apply_glow(frame, mask & (yy >= top) & (yy <= bot), 1.1, 0.5 + 0.5 * open_frac)


# ------------------------------------------------------------------- sheet build
def save_sheet(frames, path):
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (i * w, 0))
    sheet.save(path)
    return path


def save_gif(frames, path, ms, pad=24):
    w, h = frames[0].size
    flat = []
    for f in frames:
        c = Image.new("RGBA", (w + pad * 2, h + pad * 2), BG)
        c.alpha_composite(f, (pad, pad))
        flat.append(c.convert("RGB"))
    flat[0].save(path, save_all=True, append_images=flat[1:], duration=ms, loop=0)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    head = Image.open(os.path.join(PARTS, "head-standard.png")).convert("RGBA")
    torso = Image.open(os.path.join(PARTS, "torso-standard.png")).convert("RGBA")

    # ---- visor blink: mostly open, quick close-open dip ----
    vmask = cyan_mask(head, yband=(0.30, 0.80))
    blink_seq = [1.0, 1.0, 1.0, 1.0, 0.65, 0.30, 0.08, 0.30, 0.65, 1.0]
    vframes = [blink_visor(head, vmask, o) for o in blink_seq]
    save_sheet(vframes, os.path.join(OUT, "head-standard__visor-blink.png"))
    save_gif(vframes, os.path.join(OUT, "_visor-blink.gif"), 110)
    print(f"visor-blink: {len(vframes)} frames  (cyan bbox {bbox(vmask)})")

    # ---- core pulse: smooth breathing loop ----
    cmask = cyan_mask(torso, xband=(0.28, 0.72), yband=(0.25, 0.95))
    N = 10
    cframes = []
    for i in range(N):
        t = 0.5 - 0.5 * np.cos(2 * np.pi * i / N)      # 0..1..0
        cframes.append(apply_glow(torso, cmask, 0.75 + 0.6 * t, 0.35 + 0.9 * t, radius=11))
    save_sheet(cframes, os.path.join(OUT, "torso-standard__core-pulse.png"))
    save_gif(cframes, os.path.join(OUT, "_core-pulse.gif"), 100)
    print(f"core-pulse: {len(cframes)} frames  (cyan bbox {bbox(cmask)})")

    # ---- full assembled robot idling: pulse always, blink once per loop ----
    cat = gr.load_catalog()
    arm = cat["arm"]["hand"]
    leg = cat["leg"]["normal"]
    LOOP = 20
    robot_frames = []
    for i in range(LOOP):
        t = 0.5 - 0.5 * np.cos(2 * np.pi * i / LOOP)
        torso_f = apply_glow(torso, cmask, 0.78 + 0.55 * t, 0.35 + 0.85 * t, radius=11)
        # blink over frames 9..13
        if 9 <= i <= 13:
            o = [0.55, 0.2, 0.06, 0.2, 0.55][i - 9]
            head_f = blink_visor(head, vmask, o)
        else:
            head_f = apply_glow(head, vmask, 1.12, 0.85)
        canvas = Image.new("RGBA", gr.CANVAS, BG)
        pieces = {
            "legL": (leg.transpose(Image.FLIP_LEFT_RIGHT), ("leg", "normal")),
            "legR": (leg, ("leg", "normal")),
            "armL": (arm.transpose(Image.FLIP_LEFT_RIGHT), ("arm", "hand")),
            "armR": (arm, ("arm", "hand")),
            "torso": (torso_f, ("torso", "standard")),
            "head": (head_f, ("head", "standard")),
        }
        for slot in gr.Z_ORDER:
            if slot not in pieces:
                continue
            img, key = pieces[slot]
            fitted, pos = gr.place(img, gr.LAYOUT[slot], gr.OVERRIDE.get(key))
            canvas.alpha_composite(fitted, pos)
        robot_frames.append(canvas)
    # crop to content for a tighter preview
    bb = robot_frames[0].getbbox()
    robot_frames = [f.crop(bb) for f in robot_frames]
    save_gif(robot_frames, os.path.join(OUT, "_robot-idle.gif"), 90, pad=16)
    print(f"robot-idle: {len(robot_frames)} frames")
    print("Done.")


if __name__ == "__main__":
    main()
