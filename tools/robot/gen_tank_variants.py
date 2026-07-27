#!/usr/bin/env python3
"""
Generate tank-body art for the Tank accessory.

The accessory claims BOTH the torso and legs slots, and hull and tracks have to
read as one machine — so each proposal is a SINGLE painting containing the hull
and its tracks together. Generating the two halves separately never lines up:
the seam, the panel language and the palette all drift.

The hull fills the upper part of the frame at roughly the stock torso's
proportions (shoulder sockets at the sides, flat neck edge on top) and the
tracks sit under it, so the piece drops onto the skeleton between the head and
the floor line.

Outputs (tools/robot/refs/tank-variants/):
  variant-NN.webp   the sprite
  _catalog.png      each variant assembled with the stock head and arms
  _parts.png        the raw sprites, numbered
  preview.html      browser picker

Pick one:
  python3 tools/robot/gen_tank_variants.py --apply 3
"""
import argparse
import io
import math
import os
import sys
import time

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "..")
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, TOOLS)
import gen_nanobanana as nb  # noqa: E402

OUT_DIR = os.path.join(HERE, "refs", "tank-variants")
ANCHOR = os.path.join(HERE, "refs", "style-anchor", "flatvector-comical-anchor.png")
PARTS = os.path.join(ROOT, "src", "assets", "robot", "parts")

# Robot box and sockets, mirrored from src/ui/spriteRobot.js so the preview
# shows how the piece will actually seat.
RW, RH = 74, 116
SK = {
    "head": dict(x=0.50, y=0.405, mw=1.30, mh=0.62, anchor="bottom"),
    "armL": dict(x=0.045, y=0.413, mw=0.36, mh=0.348, anchor="top"),
    "armR": dict(x=0.955, y=0.413, mw=0.36, mh=0.348, anchor="top"),
}
# The piece spans the stock torso's top edge (0.315) down to the floor, and must
# always reach the head's bottom edge (0.405) so the neck stays closed.
BODY_TOP_FRAC = 0.315
BODY_HEAD_BOTTOM_FRAC = 0.405
BODY_MAX_WIDTH_MUL = 1.55

STYLE = (
    "FLAT VECTOR game-art style with a rich polished finish, comical cute mascot "
    "robot. Bold clean geometric shapes, crisp edges, limited palette, smooth soft "
    "single-step shading for gentle form, thin gold accent linework, bright neon rim "
    "on the lit edges. Crimson-red armor (#ff5a5f) with darker red underframe and cool "
    "metallic joints. Premium toy-collectible look — NO photographic texture, NO ink "
    "comic outlines, NO scene, NO cast shadow on the ground. "
    "OUTPUT: the single part only, centered with generous margin, front view, on a "
    "COMPLETELY FLAT UNIFORM MAGENTA (#FF00FF) background for chroma keying — magenta "
    "ONLY behind the part, never inside it. No text, no other parts, no character."
)

BASE = (
    "the LOWER BODY of a cute mascot robot, rebuilt as a small TANK — ONE single "
    "connected piece containing BOTH an armored hull body AND its tank tracks, "
    "painted together as one machine so they share panels, palette and lighting.\n"
    "LAYOUT, top to bottom, filling the frame:\n"
    "  * TOP ~60%: the HULL — a compact armored torso block, roughly as wide as it "
    "is tall, that reads as the robot's CHEST. It has a flat TOP EDGE where a neck "
    "plugs in, and a small round SHOULDER SOCKET on the upper left and upper right "
    "side where arms would attach.\n"
    "  * BOTTOM ~40%: the TRACKS — one continuous toothed rubber tread belt on each "
    "side with road wheels inside, chunky rectangular tread teeth, sitting flat on "
    "the ground. The tracks are slightly WIDER than the hull.\n"
    "The hull sits down INTO the tracks as a single vehicle. Overall the whole piece "
    "is a little wider than it is tall. Bright CRIMSON-RED (#ff5a5f) armor.\n"
    "IMPORTANT: NO head, NO face, NO eyes, NO arms, NO gun barrel, NO turret on top — "
    "the flat-topped hull and its tracks only. Front view, symmetric, centered."
)

# (slug, design language applied to hull AND tracks together)
VARIANTS = [
    ("01-classic", "classic military: faceted armor plates, thin gold rivet studs, "
     "a single bright cyan underglow line where hull meets track, chunky square "
     "tread blocks over three large road wheels"),
    ("02-glacis", "sloped glacis armor: the hull front angles back sharply, rows of "
     "gold bolts, cyan rim light along the top edges, medium tread with evenly "
     "spaced teeth and four road wheels"),
    ("03-neon", "sleek sci-fi: smooth seamless shell with no rivets, strong cyan neon "
     "piping tracing every panel seam and running the length of the tracks, low slim "
     "tread belt"),
    ("04-apc", "utilitarian APC: rectangular panels, side grille vents, gold latch "
     "hardware, muted cyan marker lights, wide flat track with broad shallow tread "
     "pads and five small wheels"),
    ("05-dome", "friendly rounded mascot armor: soft curves, gold trim arcs, warm cyan "
     "glow, rounded track with fat bubbly tread nubs and three big chrome-hub wheels"),
    ("06-siege", "heavy siege armor: thick layered plates with deep shadow gaps, "
     "oversized bolts, restrained cyan accents, tall deep-chevron tread with heavy "
     "mud guards over the wheels"),
    ("07-recon", "light fast recon: trimmed-down panels, sharp forward-swept angles, "
     "bright cyan speed accents, thin lightweight track with fine close-set teeth"),
    ("08-industrial", "industrial machine: riveted steel, exposed hydraulic pistons "
     "along the track frame, amber-gold hazard accents with cyan trim, tall square "
     "tread pads on a heavy sprocket"),
    ("09-retro", "1950s retro toy tank: rounded body, chrome trim band, gold "
     "pinstripes, soft cyan glow, open track frame showing four round chrome-capped "
     "wheels through it"),
    ("10-minimal", "minimal premium: one clean slab hull with a single subtle chamfer "
     "and almost no detail, one crisp cyan line, one clean tread band with evenly "
     "spaced simple teeth"),
]


def tighten(im, alpha_floor=140, erode=9, pad=2):
    """Drop chroma-key specks and crop to the painted art.

    autocrop_alpha keys off single pixels, and the magenta cut leaves faint
    flecks in the corners — a stray 12px speck was enough to anchor the crop and
    keep a third of the frame as dead space, which the game then renders as an
    air gap between the head and the hull. Eroding the mask before measuring
    drops anything thinner than the brush, so only real paint sets the bounds.
    """
    import numpy as np

    a = np.asarray(im.convert("RGBA")).copy()
    a[..., 3][a[..., 3] < alpha_floor] = 0
    h, w = a.shape[:2]
    solid = Image.fromarray(((a[..., 3] >= alpha_floor) * 255).astype("uint8"))
    # Erode on an empty margin: MinFilter repeats the edge pixels, which would
    # let a speck in the very corner look thick enough to survive.
    canvas = Image.new("L", (w + 2 * erode, h + 2 * erode), 0)
    canvas.paste(solid, (erode, erode))
    box = canvas.filter(ImageFilter.MinFilter(erode)).getbbox()
    box = ([c - erode for c in box] if box else None) or solid.getbbox()
    if not box:
        return im
    grow = erode // 2 + pad
    box = (max(0, box[0] - grow), max(0, box[1] - grow),
           min(w, box[2] + grow), min(h, box[3] + grow))
    return Image.fromarray(a).crop(box)


def font(size, bold=True):
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    try:
        return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)
    except Exception:
        return ImageFont.load_default()


def fit(im, mw, mh):
    s = min(mw / im.width, mh / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))),
                     Image.LANCZOS)


def body_rect(art, bw, bh):
    """Where the tank sprite lands in a robot box of bw x bh pixels.

    Mirrors tankBodyRect in src/ui/tankChassis.js — keep the two in step or the
    catalog stops predicting how the piece seats in game.
    """
    aspect = art.width / art.height
    h = bh * (1 - BODY_TOP_FRAC)
    if h * aspect > bw * BODY_MAX_WIDTH_MUL:
        h = max(bh * (1 - BODY_HEAD_BOTTOM_FRAC), bw * BODY_MAX_WIDTH_MUL / aspect)
    h = math.ceil(h)
    return round(h * aspect), h


def assemble(art, scale=4, bg=(10, 14, 26, 255)):
    head = Image.open(os.path.join(PARTS, "head-standard.webp")).convert("RGBA")
    arm = Image.open(os.path.join(PARTS, "arm-hand.webp")).convert("RGBA")
    bw, bh = RW * scale, RH * scale
    cw, ch = bw + 220, bh + 90
    c = Image.new("RGBA", (cw, ch), bg)
    rx, ry = (cw - bw) // 2, 50
    floor = ry + bh

    w, h = body_rect(art, bw, bh)
    c.alpha_composite(art.resize((w, h), Image.LANCZOS),
                      (rx + (bw - w) // 2, floor - h))

    def seat(im, sk):
        p = fit(im, sk["mw"] * bw, sk["mh"] * bh)
        x = round(rx + sk["x"] * bw - p.width / 2)
        jy = ry + sk["y"] * bh
        y = round(jy if sk["anchor"] == "top"
                  else jy - p.height if sk["anchor"] == "bottom"
                  else jy - p.height / 2)
        c.alpha_composite(p, (x, y))

    for key in ("armL", "armR"):
        seat(arm.transpose(Image.FLIP_LEFT_RIGHT) if key == "armR" else arm, SK[key])
    seat(head, SK["head"])

    ImageDraw.Draw(c).line([(0, floor), (cw, floor)], fill=(60, 70, 95, 255), width=2)
    return c


def build_sheets(loaded):
    pad, label_h, cols = 20, 30, 5
    bots = [assemble(a) for _, a in loaded]
    rows = (len(bots) + cols - 1) // cols
    cwid, chei = bots[0].width, bots[0].height
    sheet = Image.new("RGBA", (pad + cols * (cwid + pad),
                               pad + rows * (label_h + chei + pad)), (10, 14, 26, 255))
    d = ImageDraw.Draw(sheet)
    for i, bot in enumerate(bots):
        x = pad + (i % cols) * (cwid + pad)
        y = pad + (i // cols) * (label_h + chei + pad)
        d.text((x, y), f"#{i + 1}  {loaded[i][0]}", font=font(18), fill=(120, 200, 255, 255))
        sheet.alpha_composite(bot, (x, y + label_h))
    cat = os.path.join(OUT_DIR, "_catalog.png")
    sheet.convert("RGB").save(cat)

    cellw, cellh = 300, 240
    parts = Image.new("RGBA", (pad + cols * (cellw + pad),
                               pad + rows * (label_h + cellh + pad)), (10, 14, 26, 255))
    d2 = ImageDraw.Draw(parts)
    for i, (slug, art) in enumerate(loaded):
        x = pad + (i % cols) * (cellw + pad)
        y = pad + (i // cols) * (label_h + cellh + pad)
        d2.text((x, y), f"#{i + 1}", font=font(18), fill=(120, 200, 255, 255))
        p = fit(art, cellw, cellh)
        parts.alpha_composite(p, (x + (cellw - p.width) // 2,
                                  y + label_h + (cellh - p.height) // 2))
    pth = os.path.join(OUT_DIR, "_parts.png")
    parts.convert("RGB").save(pth)
    return cat, pth


def write_html(loaded):
    lines = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Tank bodies</title>",
        "<style>body{font-family:system-ui,sans-serif;background:#0a0e1a;color:#f5f7ff;margin:24px}",
        ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}",
        ".card{background:#121828;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px}",
        ".card img{width:100%;background:#060912;border-radius:8px}",
        ".num{color:#29b6f6;font-size:1.4rem;font-weight:700}</style></head>",
        "<body><h1>Tank bodies — hull and tracks in one piece</h1>",
        "<p>Tell the agent <code>apply variant 3</code>.</p><div class='grid'>",
    ]
    for i, (slug, _) in enumerate(loaded):
        lines.append(f"<div class='card'><div class='num'>#{i + 1}</div>"
                     f"<img src='variant-{i + 1:02d}.webp'><p>{slug}</p></div>")
    lines.append("</div></body></html>")
    out = os.path.join(OUT_DIR, "preview.html")
    with open(out, "w") as f:
        f.write("\n".join(lines))
    return out


def generate(force=False, only=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    client = nb.make_client(nb.load_key())
    style_ref = open(ANCHOR, "rb").read()
    loaded = []
    for i, (slug, language) in enumerate(VARIANTS):
        n = i + 1
        dest = os.path.join(OUT_DIR, f"variant-{n:02d}.webp")
        if (only and n not in only) or (os.path.exists(dest) and not force):
            if os.path.exists(dest):
                loaded.append((slug, Image.open(dest).convert("RGBA")))
            continue
        prompt = f"{STYLE}\n\n{BASE}\n\nDesign language: {language}."
        print(f"generating #{n} {slug}…")
        raw = nb.gen_image(client, prompt, aspect="4:3", style_ref_bytes=style_ref)
        art = tighten(nb.remove_chroma_bg(Image.open(io.BytesIO(raw))))
        art.save(dest, "WEBP", quality=92)
        loaded.append((slug, art))
        time.sleep(1.2)

    cat, parts = build_sheets(loaded)
    html = write_html(loaded)
    print(f"\ncatalog: {cat}\nparts:   {parts}\npreview: {html}")


def apply_choice(num):
    import importlib.util
    src = os.path.join(OUT_DIR, f"variant-{num:02d}.webp")
    if not os.path.exists(src):
        sys.exit(f"Missing {src} — generate first.")
    # One sprite for the whole lower body; the renderer hides the stock torso.
    p1 = os.path.join(PARTS, "leg-tank.webp")
    # Re-crop on the way in: the renderer sizes the piece from its frame, so any
    # dead space left in the reference would show up as an air gap on court.
    art = tighten(Image.open(src).convert("RGBA"))
    art.save(p1, "WEBP", quality=92)
    print(f"applied #{num} -> {p1}  ({art.width}x{art.height})")

    spec = importlib.util.spec_from_file_location(
        "gen_p2_set", os.path.join(HERE, "gen_p2_set.py"))
    p2mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(p2mod)
    p2 = os.path.join(ROOT, "src", "assets", "robot", "parts-p2", "leg-tank.webp")
    p2mod.recolor(p1, p2)
    print(f"baked P2 -> {p2}\nReload the game.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*", type=int)
    ap.add_argument("--sheets-only", action="store_true")
    ap.add_argument("--apply", type=int, metavar="N")
    args = ap.parse_args()
    if args.apply:
        apply_choice(args.apply)
    elif args.sheets_only:
        loaded = [(slug, Image.open(os.path.join(OUT_DIR, f"variant-{i + 1:02d}.webp"))
                   .convert("RGBA"))
                  for i, (slug, _) in enumerate(VARIANTS)
                  if os.path.exists(os.path.join(OUT_DIR, f"variant-{i + 1:02d}.webp"))]
        build_sheets(loaded)
        write_html(loaded)
        print("sheets rebuilt")
    else:
        generate(force=args.force, only=set(args.only) if args.only else None)


if __name__ == "__main__":
    main()
