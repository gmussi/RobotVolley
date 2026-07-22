#!/usr/bin/env python3
"""
Generate layered stadium background in minimal geometric flat-vector style.

Generates a master (unless present) plus 3 chroma-keyed layers aligned for stacking.

USAGE
    pip install google-genai pillow numpy
    python3 tools/gen_stadium_layers.py               # missing assets only
    python3 tools/gen_stadium_layers.py --force       # regenerate master + all layers
    python3 tools/gen_stadium_layers.py --only sky stadium court
    python3 tools/gen_stadium_layers.py --layers-only # skip master, use existing ref
"""
import argparse
import io
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(ROOT, "refs", "stadium.png")
OUT_DIR = os.path.join(ROOT, "..", "src", "assets", "bg")
RAW_DIR = os.path.join(ROOT, "refs", "stadium")
WEBP_QUALITY = 88

sys.path.insert(0, ROOT)
from gen_nanobanana import load_key, make_client, gen_image, remove_chroma_bg  # noqa: E402

STYLE = (
    "Flat vector illustration for a premium arcade sports game. Bold geometric shapes, "
    "clean hard edges, flat color fills only — no gradients, no brushwork, no texture, "
    "no 3D shading, not photographic. Limited palette: deep navy, crimson (#ff5a5f), "
    "cyan (#29b6f6), dark floor tones. No text, no watermark, no UI chrome."
)

MASTER_SUBJECT = (
    "Wide 5:3 game backdrop. Robot volleyball stadium inside a neon cyberpunk city at "
    "night, court-level camera looking across the arena. Bottom ~15%: flat dark court "
    "floor strip. Left half: flat crimson glow zone. Right half: flat cyan glow zone. "
    "Mid-ground: simplified stadium seating as stepped rectangles, flat roof beams, "
    "abstract rectangular billboards (no readable text). Background: open roof revealing "
    "flat rectangular skyscraper silhouettes, small white star dots, flat triangular "
    "searchlight beams. Geometric and readable. NO volleyball net, NO net post, NO ball, "
    "NO players. Bleed to all edges."
)

LAYER_WRAPPER = (
    "Match the EXACT camera angle, horizon line, perspective, and composition of "
    "the FIRST reference image. Same framing — do not move or zoom the viewpoint. "
    "Flat vector style with hard edges and flat fills only. "
    "Draw ONLY the layer content described below. Every pixel NOT part of this layer "
    "must be flat solid magenta (#FF00FF) chroma-key with no gradients on the key. "
    "Do NOT include a volleyball net, net post, or poles."
)

LAYERS = [
    ("stadium-sky", (
        "LAYER: SKY AND FAR DISTANCE ONLY. "
        "Flat deep navy sky, small white dot stars, open roof opening, distant city as "
        "simple rectangular skyscraper silhouettes with tiny window dots, flat triangular "
        "searchlight cones. "
        "Exclude: stadium seating, billboards, court floor, interior beams. Magenta key."
    )),
    ("stadium-stadium", (
        "LAYER: STADIUM INTERIOR MID-GROUND ONLY. "
        "Flat stepped seating tiers, geometric roof framing beams, abstract rectangular "
        "billboards (no text), flat crimson zone on left, flat cyan zone on right, "
        "simple flat fog bands as semi-opaque horizontal rectangles. "
        "Exclude: sky, stars, exterior skyline, court floor. NO net, NO net post. Magenta key."
    )),
    ("stadium-court", (
        "LAYER: COURT FLOOR FOREGROUND ONLY. "
        "Flat dark court surface in the lowest ~15–18% of frame, simple geometric "
        "crimson and cyan reflection shapes on the floor, optional flat fog strip. "
        "Exclude: seating, walls, sky, buildings, billboards, net. Magenta key above floor."
    )),
]


def ensure_master(client, force=False):
    raw_master = os.path.join(RAW_DIR, "master.png")
    if os.path.exists(MASTER) and not force:
        return open(MASTER, "rb").read()

    print("• generating master…")
    prompt = f"{STYLE}\nSubject: {MASTER_SUBJECT}"
    data = gen_image(client, prompt, aspect="16:9")
    os.makedirs(RAW_DIR, exist_ok=True)
    open(raw_master, "wb").write(data)
    open(MASTER, "wb").write(data)
    print(f"  wrote {os.path.relpath(MASTER, os.path.join(ROOT, '..'))}")
    return data


def master_size():
    with Image.open(MASTER) as im:
        return im.size


def layer_to_webp(png_data, target_size):
    im = remove_chroma_bg(Image.open(io.BytesIO(png_data)))
    if im.size != target_size:
        im = im.resize(target_size, Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def export_master_webp(target_size):
    im = Image.open(MASTER).convert("RGB")
    if im.size != target_size:
        im = im.resize(target_size, Image.LANCZOS)
    dest = os.path.join(OUT_DIR, "stadium-master.webp")
    im.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
    print(f"  wrote {os.path.relpath(dest, os.path.join(ROOT, '..'))}")


def main():
    ap = argparse.ArgumentParser(description="Generate stadium background layers")
    ap.add_argument("--force", action="store_true", help="regenerate master + layers")
    ap.add_argument("--layers-only", action="store_true",
                    help="skip master generation; use tools/refs/stadium.png")
    ap.add_argument("--only", nargs="*", metavar="LAYER",
                    help="sky | stadium | court | stadium-sky | …")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)

    only = None
    if args.only:
        only = set()
        for name in args.only:
            stem = name if name.startswith("stadium-") else f"stadium-{name}"
            only.add(stem)

    client = make_client(load_key())

    if args.layers_only and not os.path.exists(MASTER):
        sys.exit(f"Missing master reference: {MASTER}")

    if not args.layers_only:
        ensure_master(client, force=args.force)

    ref = open(MASTER, "rb").read()
    target_size = master_size()
    export_master_webp(target_size)

    for stem, subject in LAYERS:
        if only and stem not in only:
            continue
        dest = os.path.join(OUT_DIR, f"{stem}.webp")
        raw = os.path.join(RAW_DIR, f"{stem}.png")
        if os.path.exists(dest) and not args.force:
            print(f"  skip {stem} (exists)")
            continue

        prompt = f"{STYLE}\n{LAYER_WRAPPER}\nSubject: {subject}"
        print(f"• generating {stem}…")
        data = gen_image(client, prompt, aspect="16:9", style_ref_bytes=ref)
        open(raw, "wb").write(data)
        webp = layer_to_webp(data, target_size)
        open(dest, "wb").write(webp)
        print(f"  wrote {os.path.relpath(dest, os.path.join(ROOT, '..'))}")

    print("Done.")


if __name__ == "__main__":
    main()
