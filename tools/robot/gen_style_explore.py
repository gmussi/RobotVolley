#!/usr/bin/env python3
"""
Robot Volley — art-direction exploration.

Renders ONE canonical robot volleyball athlete in N different art styles so the
team can pick a direction. Same character, same pose, same parts every time —
only the rendering style changes — so the comparison is about STYLE, not design.

Reuses the Gemini client + gen_image() from tools/gen_nanobanana.py.

    python3 tools/robot/gen_style_explore.py            # missing only
    python3 tools/robot/gen_style_explore.py --force    # regenerate all
    python3 tools/robot/gen_style_explore.py --only 02-glossy-toon
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

OUT_DIR = os.path.join(HERE, "refs", "style-explore-comical")
BG = "#0a0e1a"  # game background navy

# The exact same robot every time, described from the in-game drawing code.
# COMICAL revision: short stubby legs, oversized head + chunky torso, cute proportions.
CANON_ROBOT = (
    "SUBJECT — a single full-body robot volleyball athlete with COMICAL, CUTE, "
    "CARTOONY proportions: a big oversized head and a chunky rounded barrel torso "
    "sitting on SHORT STUBBY LITTLE LEGS, standing in a bouncy, slightly goofy "
    "athletic ready-pose, facing the viewer at a slight three-quarter angle, little "
    "arms out. Think a squat, adorable mascot bot — top-heavy and roughly 2.5 heads "
    "tall, NOT a tall heroic figure. "
    "ANATOMY (keep identical every time): an oversized rounded head with one wide "
    "glowing horizontal visor-eye and a short antenna topped by a small lit bulb; "
    "a big chunky rounded chest/torso with a bright glowing vertical energy core down "
    "the center; two short stubby arms ending in simple rounded mitten-hands; two very "
    "SHORT STUBBY legs ending in comically big chunky athletic sneaker-boots. "
    "COLORWAY: crimson-red armor plating (#ff5a5f) with darker red limbs, cool metallic "
    "underframe, and cyan-and-gold neon rim-light on the lit edges; the visor-eye and "
    "chest-core glow cyan. Playful, charming, readable silhouette that would still read "
    "at a small thumbnail size. "
    "COMPOSITION: the whole robot centered and fully visible head-to-toe with margin "
    "around it, standing on a plain flat dark navy background, a soft round contact "
    "shadow beneath the boots. Absolutely NO text, NO logos, NO net, NO ball, NO other "
    "characters, NO UI — just the one robot on the plain background."
)

# 5 candidate directions, each still inside the neon sci-fi sports world.
STYLES = [
    ("01-painterly-neon",
     "Painterly Neon Broadcast",
     "Hand-painted digital illustration for a premium neon sci-fi sports game. "
     "Rich saturated colors, soft painterly brushwork, atmospheric depth, gentle "
     "neon bloom on the glowing parts, cinematic key-light with colored rim light. "
     "Confident illustrative finish — not photographic, not flat vector, not pixel "
     "art, no cel outlines."),

    ("02-glossy-toon-3d",
     "Glossy Toon 3D",
     "Rendered like a glossy 3D toon collectible — think Rocket League and Fall Guys. "
     "Smooth rounded vinyl-plastic and glossy metal surfaces, soft global illumination, "
     "punchy specular highlights, chunky friendly proportions, clean ambient occlusion. "
     "Bright, toy-like, premium mobile-game 3D render. Not hand-painted, not flat, no "
     "hard ink outlines."),

    ("03-flat-vector",
     "Flat Vector Esports",
     "Bold flat vector illustration, modern esports / app-icon aesthetic. Clean crisp "
     "geometric shapes, limited palette, flat color fills with just one or two subtle "
     "gradient steps for form, sharp neon rim accents, no rendered texture, no photographic "
     "shading, no gritty detail. Confident graphic design finish, infinitely scalable look."),

    ("04-anime-cel",
     "Anime Cel-Shaded Mecha",
     "Cel-shaded anime mecha style, energetic sports-anime vibe. Clean bold ink outlines, "
     "flat two-tone cel shadows with hard shadow edges, bright saturated fills, small sharp "
     "specular glints, expressive dynamic feel. Looks like a key frame from a modern anime. "
     "Not painterly, not photoreal, not 3D."),

    ("05-brushed-metal",
     "Sleek Brushed Metal",
     "Semi-realistic sleek product-render style. Brushed and polished metal with fine "
     "reflections, crisp sharp specular highlights, moody cinematic studio lighting with "
     "strong colored rim light, subtle surface scratches and panel lines, shallow depth. "
     "A premium 'chrome athlete' look — grounded and physical, not cartoonish, not flat."),
]

ASPECT = "3:4"
MAXLONG = 1100


def label_sheet(images_with_titles, out_path):
    """Build a single labeled contact sheet of all styles side by side."""
    cols = len(images_with_titles)
    cell_w, cell_h = 520, 720
    pad, label_h = 24, 54
    W = pad + cols * (cell_w + pad)
    H = pad + label_h + cell_h + pad
    sheet = Image.new("RGB", (W, H), (10, 14, 26))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
        small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        small = font
    for i, (num, title, im) in enumerate(images_with_titles):
        x = pad + i * (cell_w + pad)
        fitted = im.copy()
        fitted.thumbnail((cell_w, cell_h), Image.LANCZOS)
        ox = x + (cell_w - fitted.width) // 2
        oy = pad + label_h + (cell_h - fitted.height) // 2
        sheet.paste(fitted, (ox, oy))
        draw.text((x, pad + 4), num.split("-", 1)[0], font=small, fill=(120, 200, 255))
        draw.text((x + 34, pad), title, font=font, fill=(245, 247, 255))
    sheet.save(out_path, "PNG")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    client = nb.make_client(nb.load_key())
    style_ref = nb.ensure_style_ref(client)  # shared mood anchor for cohesion

    only = set(args.only) if args.only else None
    collected = []
    for num, title, style_desc in STYLES:
        slug = num
        if only and slug not in only and title not in only:
            continue
        dest_png = os.path.join(OUT_DIR, f"{slug}.png")
        if os.path.exists(dest_png) and not args.force:
            print(f"  skip {slug} (exists)")
            collected.append((num, title, Image.open(dest_png).convert("RGB")))
            continue
        prompt = f"ART STYLE — {style_desc}\n\n{CANON_ROBOT}"
        print(f"• generating {slug} — {title} …")
        # style_ref gives shared palette/mood; each style_desc overrides the finish.
        data = nb.gen_image(client, prompt, aspect=ASPECT, mood_ref_bytes=style_ref)
        im = Image.open(io.BytesIO(data)).convert("RGB")
        w, h = im.size
        scale = min(1.0, MAXLONG / max(w, h))
        if scale < 1.0:
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        im.save(dest_png, "PNG")
        print(f"  wrote {os.path.relpath(dest_png, os.path.join(TOOLS, '..'))}")
        collected.append((num, title, im))

    if collected:
        sheet = label_sheet(collected, os.path.join(OUT_DIR, "_comparison-sheet.png"))
        print(f"Comparison sheet: {os.path.relpath(sheet, os.path.join(TOOLS, '..'))}")
    print("Done.")


if __name__ == "__main__":
    main()
