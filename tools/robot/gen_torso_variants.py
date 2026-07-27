#!/usr/bin/env python3
"""
Generate the unlockable TORSO cosmetics.

The torso is the one body slot with no gameplay attached — TORSO_TYPES has only
"standard" — which is exactly why it carries the first cosmetic set. These are
purely visual: they never touch physics, and the mid-match part lottery is
untouched by them.

Each variant must read as a distinct silhouette at ~40px tall on court and get
visibly fancier up the unlock ladder (1 -> 3 -> 5 -> 10 wins), because the whole
point is that the chrome torso looks like something you earned.

Placement is anchored the same way as every other part: the piece spans the
stock torso's box, with shoulder sockets at the upper sides and hip sockets at
the bottom, so any variant seats on the shared skeleton without a nudge.

    python3 tools/robot/gen_torso_variants.py             # generate all four
    python3 tools/robot/gen_torso_variants.py --force
    python3 tools/robot/gen_torso_variants.py --only plated
    python3 tools/robot/gen_torso_variants.py --apply     # ship them
"""
import argparse
import io
import os
import sys
import time

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "..")
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, TOOLS)
import gen_nanobanana as nb  # noqa: E402

OUT_DIR = os.path.join(HERE, "refs", "torso-variants")
ANCHOR = os.path.join(HERE, "refs", "style-anchor", "flatvector-comical-anchor.png")
PARTS = os.path.join(ROOT, "src", "assets", "robot", "parts")
PARTS_P2 = os.path.join(ROOT, "src", "assets", "robot", "parts-p2")
# The shipped torso this game already renders correctly — used as a hard
# composition reference so new variants copy its exact camera angle and
# shoulder-to-chest proportions instead of drifting to a flat front view.
REFERENCE_TORSO = os.path.join(PARTS, "torso-standard.webp")

STYLE = (
    "FLAT VECTOR game-art style with a rich polished finish, comical cute mascot "
    "robot. Bold clean geometric shapes, crisp edges, limited palette, smooth soft "
    "single-step shading for gentle form, thin gold accent linework, bright neon rim "
    "on the lit edges. Crimson-red armor (#ff5a5f) with darker red underframe and cool "
    "metallic joints. Premium toy-collectible look — NO photographic texture, NO ink "
    "comic outlines, NO scene, NO cast shadow on the ground. "
    "OUTPUT: the single part only, centered with generous margin, on a "
    "COMPLETELY FLAT UNIFORM MAGENTA (#FF00FF) background for chroma keying — magenta "
    "ONLY behind the part, never inside it. No text, no other parts, no character."
)

BASE = (
    "the robot's CHEST/TORSO only — no head, no arms, no legs, no neck. Roughly as "
    "wide as it is tall. Rounded ball SHOULDER SOCKETS at the upper left and upper "
    "right edges and rounded HIP SOCKETS at the bottom left and bottom right, so "
    "limbs plug in. Flat top edge where the neck collar meets it. The torso fills "
    "the frame.\n\n"
    "CAMERA — copy the reference composition image exactly, do not draw a flat "
    "symmetric front view: the robot is turned slightly toward its own right, so "
    "the RIGHT shoulder socket reads bigger and sits lower/closer to camera, the "
    "LEFT shoulder socket reads smaller and sits higher/farther back, and the chest "
    "plate itself is asymmetric left-to-right, angled rather than mirrored. "
    "PROPORTIONS — also copy the reference's proportions: each shoulder socket is a "
    "modest accent at the corner, not a dominant shape — the chest plate fills most "
    "of the frame's width and the shoulder spheres together should not exceed roughly "
    "a third of the total width. If your draft looks like a mirror-symmetric front "
    "view, or the shoulders look as wide as the chest, that is wrong — redo it turned "
    "and with a bigger chest-to-shoulder ratio."
)

# slug -> design language. Ordered by unlock tier, escalating in visual reward:
# a plate, then vents, then a glowing core, then full chrome.
VARIANTS = [
    ("plated",
     "ARMOR-PLATED: overlapping crimson armor plates layered like a beetle's shell "
     "down the chest, each plate edged with a thin gold pinstripe, a small bolted "
     "collarbone guard across the top, and a modest glowing cyan slit at the centre. "
     "Reads as sturdy and knightly. Bold, simple, chunky plate shapes."),
    ("vented",
     "INDUSTRIAL VENTED: a boxier utilitarian chest with two tall dark louvred VENT "
     "grilles flanking a narrow central spine, exposed hex bolts at the corners, a "
     "gold hazard chevron stripe across the lower belly, and warm amber light leaking "
     "out from behind the vent slats. Reads as a working machine."),
    # The first pass on this one kept drawing a whole robot — the words "core"
    # and "glowing disc" read as a face to the model. Hence the blunt repetition.
    ("reactor",
     "REACTOR CORE: a crimson armored chest plate built around one large circular "
     "REACTOR window in the middle of the BELLY — a bright glowing cyan disc with a "
     "gold containment ring, and three thin gold energy conduits branching from it up "
     "toward the shoulder sockets and down to the hip sockets, with a faint cyan glow "
     "spilling onto the surrounding armor. "
     "CRITICAL: this is a BODY PLATE ONLY — a piece of armor, like a breastplate on a "
     "stand. There is absolutely NO HEAD, NO FACE, NO EYES, NO VISOR, NO ARMS and NO "
     "LEGS anywhere in the image. The round reactor disc is on the CHEST and is NOT a "
     "face — do not put a visor or eyes above it. Nothing sits on top of the flat top "
     "edge."),
    # Replaces an earlier silver/chrome concept: a neutral chrome base barely
    # recolored for the second team (gen_p2_set.recolor only reshifts the red
    # armor family), so this stays on that same red family like every other
    # torso — team 2 gets a proper blue read instead of staying grey.
    #
    # An earlier pass built this as two flat generations (a plain torso, a
    # straight-on crown icon) composited dead-centre in code. That guaranteed
    # centering but looked wrong: the crown was drawn with no perspective and
    # pasted flat onto a chest that's rendered in this game's fixed 3/4 turn,
    # so it read as a sticker rather than part of the armor. Back to one shot,
    # explicitly telling the model to draw the crown IN that same turned
    # perspective — foreshortened and following the chest's own rotation,
    # which also means it does not need to land at the exact pixel centre.
    ("chrome",
     "ROYAL: rich crimson-red armor, same red family as the rest of the set — "
     "CRITICAL: NOT silver, NOT chrome, NOT grey, a proper red torso so it recolors "
     "to blue for the other team like every other piece. A diagonal ROYAL-BLUE sash "
     "crosses the chest from the left shoulder to the right hip, bordered with gold "
     "piping, so the piece reads red AND blue together. "
     "Molded directly into the chest plate itself as one solid piece of armor, not "
     "a flat sticker or applique sitting on top: a bold GOLD CROWN, simplified and "
     "chunky — three thick rounded points, a plain thick band, one glowing CYAN gem "
     "at the front — large, at least a third of the chest's height, the single "
     "dominant feature. CRITICAL PERSPECTIVE: the crown is drawn in the SAME turned "
     "3/4 angle as the rest of this torso, not flat-on and not mirror-symmetrical — "
     "it is foreshortened and tilted to match the chest's own rotation, following "
     "the curved armor surface the way the shoulder sockets already do. It is fine, "
     "even correct, for it to sit slightly off the exact centre if that is where "
     "the chest's turned surface puts it — matching the perspective matters more "
     "than matching the centreline. Gold trim traces the chest seams, the crown's "
     "own edges, and the socket rings. This is the rarest, most prestigious item "
     "in the set — bold and unmistakably regal."),
]


def tighten(im, alpha_floor=140, erode=9, pad=2):
    """Crop to solid content — the renderer sizes from the frame, so dead space
    around the art becomes an air gap at the shoulder seam on court."""
    a = im.split()[-1].point(lambda v: 255 if v >= alpha_floor else 0)
    for _ in range(max(0, erode) // 3):
        a = a.filter(ImageFilter.MinFilter(3))
    box = a.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad); y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def font(size, bold=True):
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/Supplemental/Arial.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def build_sheet(loaded):
    """One sheet with the stock torso first, so the new art is judged against
    what it has to sit beside."""
    cell_w, cell_h, pad = 260, 300, 16
    stock = Image.open(os.path.join(PARTS, "torso-standard.webp")).convert("RGBA")
    row = [("standard (stock)", stock)] + loaded
    sheet = Image.new("RGBA", (pad + len(row) * (cell_w + pad), cell_h + 60), (10, 14, 26, 255))
    d = ImageDraw.Draw(sheet)
    f = font(18)
    for i, (slug, art) in enumerate(row):
        x = pad + i * (cell_w + pad)
        scale = min((cell_w - 40) / art.width, (cell_h - 40) / art.height)
        im = art.resize((int(art.width * scale), int(art.height * scale)), Image.LANCZOS)
        sheet.alpha_composite(im, (x + (cell_w - im.width) // 2, 20 + (cell_h - 40 - im.height) // 2))
        d.text((x + cell_w // 2, cell_h + 24), slug, font=f, fill=(230, 236, 255, 255), anchor="ma")
    out = os.path.join(OUT_DIR, "_sheet.png")
    sheet.save(out)
    return out


def reference_composition_bytes():
    """The shipped standard torso, flattened onto a plain dark backdrop and
    re-encoded as PNG — this is the composition reference (camera angle,
    shoulder-to-chest proportions), separate from the anchor's style/palette
    reference. A written description alone let the first pass drift to a flat
    symmetric front view; handing the model the actual working torso fixes that."""
    art = Image.open(REFERENCE_TORSO).convert("RGBA")
    bg = Image.new("RGBA", art.size, (30, 33, 52, 255))
    bg.alpha_composite(art)
    buf = io.BytesIO()
    bg.convert("RGB").save(buf, "PNG")
    return buf.getvalue()


def generate(force=False, only=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    client = nb.make_client(nb.load_key())
    # style_ref_bytes drives COMPOSITION here (camera angle, proportions);
    # mood_ref_bytes supplies palette/finish only — see gen_nanobanana.gen_image.
    composition_ref = reference_composition_bytes()
    mood_ref = open(ANCHOR, "rb").read()
    loaded = []
    for slug, language in VARIANTS:
        dest = os.path.join(OUT_DIR, f"torso-{slug}.webp")
        if (only and slug not in only) or (os.path.exists(dest) and not force):
            if os.path.exists(dest):
                loaded.append((slug, Image.open(dest).convert("RGBA")))
            continue
        prompt = f"{STYLE}\n\n{BASE}\n\nDesign language: {language}"
        print(f"generating torso-{slug}…")
        raw = nb.gen_image(
            client, prompt, aspect="1:1",
            style_ref_bytes=composition_ref, mood_ref_bytes=mood_ref,
        )
        art = tighten(nb.remove_chroma_bg(Image.open(io.BytesIO(raw))))
        art.save(dest, "WEBP", quality=92)
        loaded.append((slug, art))
        time.sleep(1.2)
    print(f"\nsheet: {build_sheet(loaded)}")


def apply_all(only=None):
    """Ship the references into the game and bake each P2 colorway."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "gen_p2_set", os.path.join(HERE, "gen_p2_set.py"))
    p2mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(p2mod)

    for slug, _ in VARIANTS:
        if only and slug not in only:
            continue
        src = os.path.join(OUT_DIR, f"torso-{slug}.webp")
        if not os.path.exists(src):
            print(f"skip {slug} — not generated yet")
            continue
        p1 = os.path.join(PARTS, f"torso-{slug}.webp")
        art = tighten(Image.open(src).convert("RGBA"))
        art.save(p1, "WEBP", quality=92)
        p2 = os.path.join(PARTS_P2, f"torso-{slug}.webp")
        p2mod.recolor(p1, p2)
        print(f"applied {slug} -> {p1} ({art.width}x{art.height}) + P2")
    print("Reload the game.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if args.apply:
        apply_all(args.only)
    else:
        generate(args.force, args.only)


if __name__ == "__main__":
    main()
