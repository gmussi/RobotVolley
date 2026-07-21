#!/usr/bin/env python3
"""
Robot Volley — procedural SVG asset generator.

Generates baseline art that works without Gemini. Run:
    python3 tools/genart.py

Output: src/assets/bg/arena.svg, src/assets/logo.svg
Painted upgrades: tools/gen_nanobanana.py (requires GEMINI_API_KEY)
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ROOT, "..", "src", "assets")


def save(rel, svg):
    path = os.path.join(ASSETS, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(svg + "\n")
    print(f"  wrote {rel}")


def arena_svg():
    w, h = 1000, 600
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1430"/>
      <stop offset="1" stop-color="#151d3d"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2f45"/>
      <stop offset="1" stop-color="#171a29"/>
    </linearGradient>
    <radialGradient id="glowL" cx="25%" cy="20%" r="50%">
      <stop offset="0" stop-color="#ff5a5f" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ff5a5f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowR" cx="75%" cy="20%" r="50%">
      <stop offset="0" stop-color="#29b6f6" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#29b6f6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{w}" height="560" fill="url(#sky)"/>
  <rect width="{w}" height="560" fill="url(#glowL)"/>
  <rect width="{w}" height="560" fill="url(#glowR)"/>
  <g stroke="rgba(255,255,255,0.04)" stroke-width="1">
    {"".join(f'<line x1="{x}" y1="0" x2="{x}" y2="560"/>' for x in range(0, w, 50))}
  </g>
  <rect y="560" width="{w}" height="40" fill="url(#floor)"/>
  <rect y="560" width="{w}" height="3" fill="rgba(255,255,255,0.08)"/>
  <!-- stars -->
  <g fill="#fff" opacity="0.35">
    <circle cx="120" cy="80" r="1.2"/><circle cx="340" cy="45" r="1"/><circle cx="780" cy="110" r="1.4"/>
    <circle cx="620" cy="60" r="0.9"/><circle cx="900" cy="90" r="1.1"/><circle cx="480" cy="130" r="0.8"/>
  </g>
</svg>'''


def logo_svg():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 120" aria-hidden="true">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3c0"/>
      <stop offset="1" stop-color="#f2b705"/>
    </linearGradient>
  </defs>
  <text x="210" y="72" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif"
        font-size="52" font-weight="700" fill="url(#gold)">ROBOT VOLLEY</text>
  <circle cx="52" cy="60" r="18" fill="none" stroke="#ffd54a" stroke-width="3"/>
  <circle cx="368" cy="60" r="18" fill="none" stroke="#ffd54a" stroke-width="3"/>
</svg>'''


def main():
    print("Generating SVG assets…")
    save("bg/arena.svg", arena_svg())
    save("logo.svg", logo_svg())
    print("Done.")


if __name__ == "__main__":
    main()
