#!/usr/bin/env python3
"""
Generate layered stadium background for Robot Volley.

Generates a master (unless present) plus 3 chroma-keyed layers aligned for stacking.
An optional mood reference (tools/refs/stadium/neon-indoor-ref.png) supplies palette
and atmosphere only — never composition.

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
MOOD_REF = os.path.join(ROOT, "refs", "stadium", "neon-indoor-ref.png")
OUT_DIR = os.path.join(ROOT, "..", "src", "assets", "bg")
RAW_DIR = os.path.join(ROOT, "refs", "stadium")
WEBP_QUALITY = 88

sys.path.insert(0, ROOT)
from gen_nanobanana import load_key, make_client, gen_image, remove_chroma_bg  # noqa: E402

STYLE = (
    "Hand-painted neon sci-fi sports arena at night for a 2D arcade volleyball game. "
    "Indoor brutalist concrete stadium lit by electric crimson and cyan neon strips, "
    "dark polished court floor, center-court spotlight, atmospheric haze. Painterly "
    "illustrative style — not flat vector, not photographic 3D. Saturated neon accents "
    "against deep shadow. No text, no watermark, no UI chrome."
)

MASTER_SUBJECT = (
    "Wide 5:3 game backdrop — ORIGINAL composition designed for a side-view volleyball "
    "game. Symmetrical court-level camera looking straight across the arena (NOT from "
    "behind a net post). Bottom ~15%: flat dark court floor strip with subtle glowing "
    "cyan line hints. Left half: crimson/magenta ambient glow zone. Right half: cyan "
    "ambient glow zone. Mid-ground: simplified tiered seating as stepped shapes, dark "
    "concrete pillars with vertical neon accents, horizontal magenta/cyan strip "
    "lighting on tiers. Background: enclosed arena ceiling with structural beams and "
    "soft atmospheric haze — no exterior city skyline. Abstract blank light panels "
    "(no readable text). NO volleyball net, NO net post, NO ball, NO players, NO "
    "scoreboard text. Bleed to all edges."
)

LAYER_WRAPPER = (
    "Match the EXACT camera angle, horizon line, perspective, and composition of "
    "the FIRST reference image. Same framing — do not move or zoom the viewpoint. "
    "Draw ONLY the layer content described below. Every pixel NOT part of this layer "
    "must be flat solid magenta (#FF00FF) chroma-key with no gradients on the key. "
    "Do NOT include a volleyball net, net post, or poles."
)

LAYERS = [
    ("stadium-sky", (
        "LAYER: UPPER ARENA AND CEILING ONLY. "
        "Enclosed dark concrete ceiling with structural beams, soft atmospheric haze, "
        "subtle magenta and cyan neon accent strips on ceiling beams, abstract blank "
        "light panels (no text). "
        "Exclude: seating tiers, court floor, pillars at court level. Magenta key."
    )),
    ("stadium-stadium", (
        "LAYER: STADIUM INTERIOR MID-GROUND ONLY. "
        "Tiered seating with horizontal magenta and cyan neon strip lighting, dark "
        "concrete pillars with vertical cyan accents, flat crimson glow zone on left, "
        "flat cyan glow zone on right, simple atmospheric haze bands. "
        "Exclude: ceiling, upper walls, court floor. NO net, NO net post. Magenta key."
    )),
    ("stadium-court", (
        "LAYER: COURT FLOOR FOREGROUND ONLY. "
        "Flat dark polished court surface in the lowest ~15–18% of frame, subtle glowing "
        "cyan boundary line hints, crimson and cyan reflection shapes on the glossy "
        "floor, center-court spotlight wash. "
        "Exclude: seating, walls, ceiling, pillars, net. Magenta key above floor."
    )),
]


def load_mood_ref():
    if os.path.exists(MOOD_REF):
        return open(MOOD_REF, "rb").read()
    return None


def ensure_master(client, force=False, mood_ref=None):
    raw_master = os.path.join(RAW_DIR, "master.png")
    if os.path.exists(MASTER) and not force:
        return open(MASTER, "rb").read()

    print("• generating master…")
    prompt = f"{STYLE}\nSubject: {MASTER_SUBJECT}"
    data = gen_image(client, prompt, aspect="16:9", mood_ref_bytes=mood_ref)
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
    mood_ref = load_mood_ref()
    if mood_ref:
        print(f"  mood ref: {os.path.relpath(MOOD_REF, os.path.join(ROOT, '..'))}")

    if args.layers_only and not os.path.exists(MASTER):
        sys.exit(f"Missing master reference: {MASTER}")

    if not args.layers_only:
        ensure_master(client, force=args.force, mood_ref=mood_ref)

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
        data = gen_image(
            client, prompt, aspect="16:9",
            style_ref_bytes=ref, mood_ref_bytes=mood_ref,
        )
        open(raw, "wb").write(data)
        webp = layer_to_webp(data, target_size)
        open(dest, "wb").write(webp)
        print(f"  wrote {os.path.relpath(dest, os.path.join(ROOT, '..'))}")

    print("Done.")


if __name__ == "__main__":
    main()
