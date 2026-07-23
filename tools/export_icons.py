#!/usr/bin/env python3
"""
Export favicon, app icons, and OG image from src/assets/icon.svg.

Requires: pip install pillow
Optional (better quality): pip install cairosvg

Usage:
    python3 tools/export_icons.py
"""
import io
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "..", "src", "assets")
PUBLIC = os.path.join(ROOT, "..", "public")
ICON_SVG = os.path.join(ASSETS, "icon.svg")
OG_SVG = os.path.join(ASSETS, "og-image.svg")


def svg_to_png(svg_path, size):
    """Render SVG to PNG bytes at given square size."""
    try:
        import cairosvg
        return cairosvg.svg2png(
            url=svg_path,
            output_width=size,
            output_height=size,
        )
    except ImportError:
        pass

    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (size, size), (10, 14, 26, 255))
    d = ImageDraw.Draw(im)
    cx, cy = size // 2, size // 2
    r = int(size * 0.27)
    gold = (255, 213, 74, 230)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=gold, width=max(2, size // 64))
    d.line([cx - r // 3, cy - r // 3, cx + r // 3, cy + r // 3], fill=(41, 182, 246, 200), width=max(1, size // 128))
    d.line([cx + r // 3, cy - r // 3, cx - r // 3, cy + r // 3], fill=(255, 90, 95, 200), width=max(1, size // 128))
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=gold)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def png_to_ico(png_bytes, sizes=(16, 32, 48)):
    from PIL import Image

    base = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    images = [base.resize((s, s), Image.LANCZOS) for s in sizes]
    buf = io.BytesIO()
    images[0].save(buf, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[1:])
    return buf.getvalue()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  wrote {os.path.relpath(path, os.path.join(ROOT, '..'))}")


def export_og_image():
    """Create 1200×630 OG image."""
    from PIL import Image, ImageDraw, ImageFont

    w, h = 1200, 630
    im = Image.new("RGB", (w, h), (10, 14, 26))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h
        c = int(10 + t * 8), int(14 + t * 12), int(26 + t * 20)
        d.line([(0, y), (w, y)], fill=c)
    d.ellipse([200, 80, 500, 380], fill=(255, 90, 95, 30) if im.mode == "RGBA" else None)
    # gradient glow approximations
    for i in range(40):
        alpha = int(12 - i * 0.28)
        if alpha <= 0:
            break
        d.ellipse([350 - i * 4, 200 - i * 2, 850 + i * 4, 500 + i * 2], outline=(255, 213, 74, alpha))
    d.ellipse([380, 220, 820, 480], outline=(255, 213, 74), width=3)
    d.text((600, 280), "ROBOT VOLLEY", fill=(255, 213, 74), anchor="mm")
    d.text((600, 340), "Rally. Customize. Smash.", fill=(154, 164, 192), anchor="mm")
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def main():
    print("Exporting icons…")
    os.makedirs(PUBLIC, exist_ok=True)

    if not os.path.exists(ICON_SVG):
        print("  icon.svg missing — run npm run genart first")
        return

    sizes = {
        "favicon-32.png": 32,
        "icon-192.png": 192,
        "apple-touch-icon.png": 180,
        "icon-512.png": 512,
    }

    master_png = svg_to_png(ICON_SVG, 512)

    for name, size in sizes.items():
        from PIL import Image
        im = Image.open(io.BytesIO(master_png)).convert("RGBA")
        im = im.resize((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "PNG")
        write(os.path.join(PUBLIC, name), buf.getvalue())

    write(os.path.join(PUBLIC, "favicon.ico"), png_to_ico(master_png))
    write(os.path.join(PUBLIC, "og-image.png"), export_og_image())
    print("Done.")


if __name__ == "__main__":
    main()
