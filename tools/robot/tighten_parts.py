#!/usr/bin/env python3
"""
Robot Volley — tight-crop the part sprites to their real content.

Several generated parts (the arm, all three legs, the satellite head) sit in only
a corner of their canvas with 40-60% empty space. Because the renderer centres
each sprite on its socket, that empty space pushes the visible art off the joint
— which is why the arms floated away from the shoulders no matter how the socket
was tuned. Cropping to content makes the socket numbers mean what they say.

The crop box is computed from the P1 image and applied IDENTICALLY to P2, so the
two teams keep pixel-identical geometry.

    python3 tools/robot/tighten_parts.py            # report only
    python3 tools/robot/tighten_parts.py --apply
"""
import argparse
import glob
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
P1 = os.path.join(ROOT, "src", "assets", "robot", "parts")
P2 = os.path.join(ROOT, "src", "assets", "robot", "parts-p2")

THRESH = 0.03   # a row/col counts as content if it holds >3% of the peak solid count
PAD = 2         # keep a couple of px so antialiased edges aren't clipped


def content_box(im):
    solid = np.asarray(im.convert("RGBA"))[..., 3] > 128
    cols, rows = solid.sum(axis=0), solid.sum(axis=1)
    if cols.max() == 0:
        return (0, 0, im.width, im.height)
    cx = np.where(cols > cols.max() * THRESH)[0]
    ry = np.where(rows > rows.max() * THRESH)[0]
    return (
        max(0, int(cx.min()) - PAD),
        max(0, int(ry.min()) - PAD),
        min(im.width, int(cx.max()) + 1 + PAD),
        min(im.height, int(ry.max()) + 1 + PAD),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    for src in sorted(glob.glob(os.path.join(P1, "*.webp"))):
        name = os.path.basename(src)
        im1 = Image.open(src).convert("RGBA")
        box = content_box(im1)
        ow, oh = im1.size
        nw, nh = box[2] - box[0], box[3] - box[1]
        if (nw, nh) == (ow, oh):
            print(f"  {name:22s} already tight ({ow}x{oh})")
            continue
        print(f"  {name:22s} {ow}x{oh} -> {nw}x{nh}   crop={box}")
        if not args.apply:
            continue
        im1.crop(box).save(src, "WEBP", quality=88, method=6)
        twin = os.path.join(P2, name)          # same box keeps the teams aligned
        if os.path.exists(twin):
            Image.open(twin).convert("RGBA").crop(box).save(
                twin, "WEBP", quality=88, method=6)

    print("Applied." if args.apply else "Dry run — pass --apply to write.")


if __name__ == "__main__":
    main()
