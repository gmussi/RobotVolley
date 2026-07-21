#!/usr/bin/env python3
"""
Robot Volley — hand-painted art via Gemini 2.5 Flash Image.

Generates WebP upgrades for procedural SVG baselines. The game's art loader
(src/ui/art.js) prefers WebPs when present.

USAGE
    pip install google-genai pillow
    # Add GEMINI_API_KEY to .env (project root) or tools/.env
    python3 tools/gen_nanobanana.py               # missing assets only
    python3 tools/gen_nanobanana.py --force       # regenerate all
    python3 tools/gen_nanobanana.py --only bg/arena logo
    python3 tools/gen_nanobanana.py --restyle     # re-roll style anchor

See tools/ART_PIPELINE.md for details.
"""
import argparse
import io
import os
import sys
import time

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(ROOT, "..", "src", "assets")
STYLE_REF = os.path.join(ROOT, "style_ref.png")
MODEL = os.environ.get("NANOBANANA_MODEL", "gemini-2.5-flash-image")
MAXLONG = {"bg": 1600, "logo": 1200}
WEBP_QUALITY = 88

STYLE = (
    "Hand-painted digital illustration for a premium arcade sports game. "
    "Painterly visible brushwork, neon-lit retro-futuristic mood, rich saturated "
    "colors against deep shadow, atmospheric depth. Confident illustrative style — "
    "not photographic, not 3D-rendered, not flat vector. No text, no watermark, "
    "no UI chrome — just the artwork bleeding to all edges."
)

STYLE_ANCHOR_PROMPT = (
    f"{STYLE} Subject: two stylized robot athletes facing each other across a "
    "glowing volleyball net in a dark indoor arena, a golden ball suspended between "
    "them, crimson and cyan team accents, starfield visible through a high window. "
    "This image defines the master art style for the whole game. Wide cinematic "
    "composition, painterly."
)

ASSETS = [
    ("bg", "arena", "Wide 16:9 indoor robot-volleyball arena backdrop at night: "
     "dark navy ceiling with subtle starfield, crimson-tinted left court half and "
     "cyan-tinted right court half, polished floor strip at the bottom, glowing net "
     "post in the center distance, atmospheric haze, no characters, no ball, no UI."),
    ("logo", "logo", "EXCEPTION: isolated title logo emblem for a game called ROBOT "
     "VOLLEY. Bold retro-futuristic wordmark in gold and white, chunky athletic "
     "lettering, small volleyball motif, crimson and cyan accent streaks. "
     "Landscape composition on a flat uniform magenta (#FF00FF) chroma-key background "
     "with clear margin — the magenta is ONLY the backdrop, not inside the logo."),
]

LOGO_IS_CUTOUT = True


def load_key():
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    for env_path in (
        os.path.join(ROOT, ".env"),
        os.path.join(ROOT, "..", ".env"),
    ):
        if key or not os.path.exists(env_path):
            continue
        for line in open(env_path):
            line = line.strip()
            if line.startswith(("GEMINI_API_KEY=", "GOOGLE_API_KEY=")):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit(
            "No API key. Set GEMINI_API_KEY in .env or tools/.env "
            "(https://aistudio.google.com/apikey)"
        )
    return key


def make_client(key):
    try:
        from google import genai
    except ImportError:
        sys.exit("Missing SDK. Run: pip install google-genai")
    return genai.Client(api_key=key)


def gen_image(client, prompt, aspect=None, style_ref_bytes=None, tries=4):
    from google.genai import types

    parts = [prompt]
    if style_ref_bytes:
        parts = [
            "Match the exact art style, brushwork, palette and finish of the "
            "FIRST image. Then paint this new subject in that same hand:\n" + prompt,
            types.Part.from_bytes(data=style_ref_bytes, mime_type="image/png"),
        ]
    cfg_kwargs = {"response_modalities": ["IMAGE"]}
    if aspect:
        try:
            cfg_kwargs["image_config"] = types.ImageConfig(aspect_ratio=aspect)
        except Exception:
            pass
    last = None
    for n in range(tries):
        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=parts,
                config=types.GenerateContentConfig(**cfg_kwargs),
            )
            for part in resp.candidates[0].content.parts:
                if getattr(part, "inline_data", None) and part.inline_data.data:
                    return part.inline_data.data
            last = "no image part in response"
        except Exception as e:
            last = str(e)
        time.sleep(2 * (n + 1))
    raise RuntimeError(f"generation failed: {last}")


def optimize_bytes(data, maxlong):
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    scale = min(1.0, maxlong / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def remove_chroma_bg(im, t0=42, t1=115):
    import numpy as np

    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w, _ = a.shape
    c = max(8, min(h, w) // 20)
    corners = np.concatenate([
        a[:c, :c].reshape(-1, 3), a[:c, -c:].reshape(-1, 3),
        a[-c:, :c].reshape(-1, 3), a[-c:, -c:].reshape(-1, 3),
    ])
    key = np.median(corners, axis=0)
    dist = np.sqrt(((a - key) ** 2).sum(axis=2))
    alpha = np.clip((dist - t0) * 255.0 / (t1 - t0), 0, 255)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = (alpha < 255) & (r > g) & (b > g)
    mid = np.maximum(g, (r + b) / 2 - 25)
    r = np.where(spill, np.minimum(r, mid), r)
    b = np.where(spill, np.minimum(b, mid), b)
    return Image.fromarray(np.dstack([r, g, b, alpha]).astype(np.uint8), "RGBA")


def autocrop_alpha(im, pad=3, thresh=8):
    import numpy as np

    a = np.asarray(im.getchannel("A"))
    ys, xs = np.where(a > thresh)
    if not len(ys):
        return im
    x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + 1 + pad)
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + 1 + pad)
    return im.crop((x0, y0, x1, y1))


def cutout_bytes(data, maxlong):
    im = autocrop_alpha(remove_chroma_bg(Image.open(io.BytesIO(data))))
    w, h = im.size
    scale = min(1.0, maxlong / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def ensure_style_ref(client, force=False):
    if os.path.exists(STYLE_REF) and not force:
        return open(STYLE_REF, "rb").read()
    print("• painting style anchor…")
    data = gen_image(client, STYLE_ANCHOR_PROMPT, aspect="16:9")
    open(STYLE_REF, "wb").write(data)
    return data


def out_path(cat, stem):
    if cat == "logo":
        return os.path.join(ASSETS_DIR, "logo.webp")
    return os.path.join(ASSETS_DIR, cat, f"{stem}.webp")


def main():
    ap = argparse.ArgumentParser(description="Generate Robot Volley art via Gemini")
    ap.add_argument("--force", action="store_true", help="regenerate even if file exists")
    ap.add_argument("--restyle", action="store_true", help="re-roll the style anchor")
    ap.add_argument("--only", nargs="*", metavar="PATH", help="e.g. bg/arena logo")
    args = ap.parse_args()

    client = make_client(load_key())
    style_ref = ensure_style_ref(client, force=args.restyle)

    only = set(args.only) if args.only else None

    for cat, stem, subject in ASSETS:
        rel = f"{cat}/{stem}" if cat != "logo" else "logo"
        if only and rel not in only and stem not in only:
            continue
        dest = out_path(cat, stem)
        if os.path.exists(dest) and not args.force:
            print(f"  skip {rel} (exists)")
            continue
        print(f"• generating {rel}…")
        prompt = f"{STYLE}\nSubject: {subject}."
        aspect = "16:9" if cat == "bg" else "3:1"
        data = gen_image(client, prompt, aspect=aspect, style_ref_bytes=style_ref)
        maxlong = MAXLONG.get(cat if cat != "logo" else "logo", 1200)
        if cat == "logo" and LOGO_IS_CUTOUT:
            webp = cutout_bytes(data, maxlong)
        else:
            webp = optimize_bytes(data, maxlong)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "wb").write(webp)
        print(f"  wrote {os.path.relpath(dest, os.path.join(ROOT, '..'))}")

    print("Done.")


if __name__ == "__main__":
    main()
