#!/usr/bin/env python3
"""
Robot Volley — modular part generator (flat-vector comical direction).

Generates each robot part as a SEPARATE transparent sprite, then composites them
on a fixed skeleton to prove the parts register and connect. This de-risks the
part pipeline before mass-producing every head/torso/arm/leg variant.

Each part is generated on a magenta chroma-key background, cut out to transparent
PNG, then fitted into a defined socket rect on a shared canvas. Because WE control
placement, the joints always overlap and connect; the model only has to paint the
part in-style at the right rough aspect.

    python3 tools/robot/gen_parts.py            # default set, missing only
    python3 tools/robot/gen_parts.py --force
    python3 tools/robot/gen_parts.py --only head
"""
import argparse
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "..")
sys.path.insert(0, TOOLS)
import gen_nanobanana as nb  # noqa: E402

ANCHOR = os.path.join(HERE, "refs", "style-anchor", "flatvector-comical-anchor.png")
OUT_DIR = os.path.join(HERE, "refs", "parts-flatvector")

# Locked style contract — every part is painted in this exact hand.
STYLE = (
    "FLAT VECTOR game-art style, comical cute mascot robot. Bold clean geometric "
    "shapes, crisp edges, limited palette, flat color fills with only ONE subtle "
    "gradient/shadow step for form, thin gold accent linework, bright cyan neon rim "
    "on the lit edges. Crimson-red armor (#ff5a5f) with darker red underframe and "
    "cool metallic joints. NO rendered texture, NO photographic shading, NO ink comic "
    "outlines, NO scene, NO cast shadow on the ground. "
    "OUTPUT: the single part only, centered with generous margin, front view, on a "
    "COMPLETELY FLAT UNIFORM MAGENTA (#FF00FF) background for chroma keying — magenta "
    "ONLY behind the part, never inside it. No text, no other parts, no character."
)

# Each part: (slot, variant, aspect, subject). Default robot set first.
PARTS = [
    ("head", "standard", "1:1",
     "the robot's HEAD only: a big rounded-square friendly head, one wide glowing "
     "cyan horizontal visor-eye across the face, small cyan-lit antenna bulb on a "
     "short stalk at the top. Detached at the neck (flat bottom edge)."),
    ("torso", "standard", "1:1",
     "the robot's CHEST/TORSO only: a chunky rounded barrel torso plate with a bright "
     "glowing vertical cyan energy core down the center, small shoulder sockets at the "
     "upper sides and hip sockets at the bottom. No head, no arms, no legs — just the "
     "torso block, flat top and bottom edges."),
    ("arm", "hand", "2:3",
     "a single short stubby ROBOT ARM only (right arm), a rounded upper segment and a "
     "simple rounded mitten-hand, a ball-joint shoulder nub at the top where it plugs "
     "into the torso. Just the one arm, vertical, hanging slightly."),
    ("leg", "normal", "3:4",
     "a single short stubby ROBOT LEG only (right leg), a small rounded thigh/shin and "
     "a comically big chunky red-and-white athletic sneaker-boot at the bottom, a "
     "ball-joint hip nub at the top where it plugs into the torso. Just the one leg."),
]

# Skeleton layout on a 760x940 canvas — socket rects (parts overlap at joints).
CANVAS = (760, 940)
SOCKETS = {
    # (cx, cy, w, h) center-anchored boxes; parts are fitted inside preserving aspect.
    # Arms/legs sit BEHIND the torso (see Z_ORDER) so their inner edge tucks under it.
    "head":  (380, 260, 372, 372),
    "torso": (380, 540, 410, 360),
    "armL":  (250, 585, 118, 225),
    "armR":  (510, 585, 118, 225),
    "legL":  (314, 690, 132, 210),
    "legR":  (446, 690, 132, 210),
}
# Draw order back-to-front so joints tuck correctly.
Z_ORDER = ["legL", "legR", "armL", "armR", "torso", "head"]


def cut_part(data):
    """Chroma-key the magenta background to transparent and autocrop."""
    im = nb.remove_chroma_bg(Image.open(io.BytesIO(data)))
    return nb.autocrop_alpha(im, pad=2)


def fit_into(im, box):
    cx, cy, bw, bh = box
    scale = min(bw / im.width, bh / im.height)
    w, h = round(im.width * scale), round(im.height * scale)
    return im.resize((w, h), Image.LANCZOS), (cx - w // 2, cy - h // 2)


def compose(part_imgs):
    """part_imgs: {slot: PIL RGBA}. arm/leg are the right-side; left = mirrored."""
    canvas = Image.new("RGBA", CANVAS, (10, 14, 26, 255))
    mapping = {
        "legL": ("leg", True), "legR": ("leg", False),
        "armL": ("arm", True), "armR": ("arm", False),
        "torso": ("torso", False), "head": ("head", False),
    }
    for slot in Z_ORDER:
        src, mirror = mapping[slot]
        if src not in part_imgs:
            continue
        im = part_imgs[src]
        if mirror:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        fitted, pos = fit_into(im, SOCKETS[slot])
        canvas.alpha_composite(fitted, pos)
    return canvas


def exploded_sheet(part_imgs, out_path):
    order = [("head", "HEAD · standard"), ("torso", "TORSO · standard"),
             ("arm", "ARM · hand"), ("leg", "LEG · normal")]
    cell = 360
    pad, label_h = 20, 40
    cols = len(order)
    W = pad + cols * (cell + pad)
    H = pad + label_h + cell + pad
    sheet = Image.new("RGBA", (W, H), (10, 14, 26, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    for i, (slot, title) in enumerate(order):
        if slot not in part_imgs:
            continue
        x = pad + i * (cell + pad)
        im = part_imgs[slot].copy()
        im.thumbnail((cell, cell), Image.LANCZOS)
        ox = x + (cell - im.width) // 2
        oy = pad + label_h + (cell - im.height) // 2
        sheet.alpha_composite(im, (ox, oy))
        draw.text((x + 6, pad + 8), title, font=font, fill=(120, 200, 255, 255))
    sheet.convert("RGB").save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    client = nb.make_client(nb.load_key())
    style_ref = open(ANCHOR, "rb").read()

    only = set(args.only) if args.only else None
    part_imgs = {}
    for slot, variant, aspect, subject in PARTS:
        if only and slot not in only:
            continue
        dest = os.path.join(OUT_DIR, f"{slot}-{variant}.png")
        if os.path.exists(dest) and not args.force:
            print(f"  skip {slot}-{variant} (exists)")
            part_imgs[slot] = Image.open(dest).convert("RGBA")
            continue
        prompt = f"{STYLE}\n\nPART: {subject}"
        print(f"• generating {slot}-{variant} …")
        data = nb.gen_image(client, prompt, aspect=aspect, style_ref_bytes=style_ref)
        cut = cut_part(data)
        cut.save(dest)
        print(f"  wrote {os.path.relpath(dest, os.path.join(TOOLS, '..'))}")
        part_imgs[slot] = cut

    if len(part_imgs) == 4:
        ex = exploded_sheet(part_imgs, os.path.join(OUT_DIR, "_exploded.png"))
        print(f"Exploded parts: {os.path.relpath(ex, os.path.join(TOOLS, '..'))}")
        asm = compose(part_imgs)
        asm_path = os.path.join(OUT_DIR, "_reassembled.png")
        asm.convert("RGB").save(asm_path)
        print(f"Reassembled: {os.path.relpath(asm_path, os.path.join(TOOLS, '..'))}")
    print("Done.")


if __name__ == "__main__":
    main()
