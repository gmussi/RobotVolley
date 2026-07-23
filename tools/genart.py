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
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 140" aria-hidden="true">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3c0"/>
      <stop offset="0.5" stop-color="#ffd54a"/>
      <stop offset="1" stop-color="#f2b705"/>
    </linearGradient>
    <linearGradient id="neonGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd54a" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#ffd54a" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- left volleyball mark -->
  <g transform="translate(48,70)" filter="url(#glow)">
    <circle r="22" fill="none" stroke="#ffd54a" stroke-width="2.5" opacity="0.9"/>
    <path d="M-22,0 Q0,-14 22,0 Q0,14 -22,0" fill="none" stroke="#ffd54a" stroke-width="1.5" opacity="0.7"/>
    <path d="M0,-22 Q14,0 0,22 Q-14,0 0,-22" fill="none" stroke="#ffd54a" stroke-width="1.5" opacity="0.7"/>
    <line x1="-8" y1="-8" x2="8" y2="8" stroke="#29b6f6" stroke-width="1.2" opacity="0.8"/>
    <line x1="8" y1="-8" x2="-8" y2="8" stroke="#ff5a5f" stroke-width="1.2" opacity="0.8"/>
  </g>
  <!-- wordmark -->
  <text x="280" y="82" text-anchor="middle" font-family="Rajdhani, Segoe UI, system-ui, sans-serif"
        font-size="58" font-weight="700" letter-spacing="6" fill="url(#gold)">ROBOT VOLLEY</text>
  <rect x="120" y="96" width="320" height="2" rx="1" fill="url(#neonGlow)" opacity="0.8"/>
  <!-- right volleyball mark -->
  <g transform="translate(512,70)" filter="url(#glow)">
    <circle r="22" fill="none" stroke="#ffd54a" stroke-width="2.5" opacity="0.9"/>
    <path d="M-22,0 Q0,-14 22,0 Q0,14 -22,0" fill="none" stroke="#ffd54a" stroke-width="1.5" opacity="0.7"/>
    <path d="M0,-22 Q14,0 0,22 Q-14,0 0,-22" fill="none" stroke="#ffd54a" stroke-width="1.5" opacity="0.7"/>
    <line x1="-8" y1="-8" x2="8" y2="8" stroke="#29b6f6" stroke-width="1.2" opacity="0.8"/>
    <line x1="8" y1="-8" x2="-8" y2="8" stroke="#ff5a5f" stroke-width="1.2" opacity="0.8"/>
  </g>
</svg>'''


def icon_svg():
    """App icon mark — volleyball with circuit arcs, works at 32px."""
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121828"/>
      <stop offset="1" stop-color="#0a0e1a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3c0"/>
      <stop offset="1" stop-color="#f2b705"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g transform="translate(256,256)" filter="url(#glow)">
    <circle r="140" fill="none" stroke="url(#gold)" stroke-width="8"/>
    <path d="M-140,0 Q0,-90 140,0 Q0,90 -140,0" fill="none" stroke="#ffd54a" stroke-width="5" opacity="0.75"/>
    <path d="M0,-140 Q90,0 0,140 Q-90,0 0,-140" fill="none" stroke="#ffd54a" stroke-width="5" opacity="0.75"/>
    <line x1="-50" y1="-50" x2="50" y2="50" stroke="#29b6f6" stroke-width="4" opacity="0.9"/>
    <line x1="50" y1="-50" x2="-50" y2="50" stroke="#ff5a5f" stroke-width="4" opacity="0.9"/>
    <circle r="12" fill="#ffd54a" opacity="0.9"/>
  </g>
</svg>'''


def main():
    print("Generating SVG assets…")
    save("bg/arena.svg", arena_svg())
    save("logo.svg", logo_svg())
    save("icon.svg", icon_svg())
    print("Done.")


if __name__ == "__main__":
    main()
