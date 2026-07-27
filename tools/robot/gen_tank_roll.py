#!/usr/bin/env python3
"""
Robot Volley — rolling tread spritesheets for the tank body.

The tank is one painted sprite, so the belt can't just be slid sideways: its
pads run around a closed loop that bends through the nose and vanishes under the
hull. This unwraps the band just inside the track silhouette into a straight
strip, scrolls the pad detail along it while the baked lighting stays put, and
maps it back — so the pads travel around the loop instead of across the sprite.

One cycle advances the belt by exactly one pad pitch, so the strip loops.

The road wheels are NOT baked: a wheel turns ~15 pad pitches per revolution, so
it cannot share the belt's period. The renderer spins them with a transform
(drawTankWheels in src/ui/spriteRobot.js) off the same rolled distance.

Output: src/assets/robot/anim/<team>/leg-tank-roll.webp   (ROLL_FRAMES strip)
        src/assets/robot/anim/tank-roll.json              (wheels + pad pitch)

    python3 tools/robot/gen_tank_roll.py
"""
import json
import os
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SETS = {
    "p1": os.path.join(ROOT, "src", "assets", "robot", "parts"),
    "p2": os.path.join(ROOT, "src", "assets", "robot", "parts-p2"),
}
DST_ROOT = os.path.join(ROOT, "src", "assets", "robot", "anim")

ROLL_FRAMES = 6
FRAME_MAX = 448        # plenty: the body draws ~180px wide at 2x DPI
BAND_DEPTH = 22        # how far in from the silhouette the pads reach (frame px)
MIN_RUN = 120          # ignore stretches of silhouette too short to be a track
SAMPLE = 2             # unwrap supersampling, along both axes

# Clockwise 8-neighbourhood, used by the boundary walk.
DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]


def solid_warm(a):
    """Silhouette, and the crimson armour + gold trim that is never track."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return a[..., 3] > 128, (r > g + 25) & (r > b + 10)


def masks(a):
    """Silhouette, track paint, and bright wheel metal."""
    mx = a[..., :3].max(axis=2)
    mn = a[..., :3].min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    solid, warm = solid_warm(a)
    track = solid & ~warm & (mx < 150)
    wheel = solid & (sat < 0.18) & (mx >= 110)   # silver rims and hubs
    return solid, track, wheel


def trace_boundary(mask):
    """Ordered outer boundary of the mask (Moore neighbourhood tracing)."""
    h, w = mask.shape
    ys, xs = np.where(mask)
    start = (int(ys.min()), int(xs[ys == ys.min()].min()))
    contour = [start]
    p, d = start, 0
    while len(contour) < 8 * (h + w):
        for i in range(8):
            nd = (d + i) % 8
            y, x = p[0] + DIRS[nd][0], p[1] + DIRS[nd][1]
            if 0 <= y < h and 0 <= x < w and mask[y, x]:
                p, d = (y, x), (nd + 6) % 8
                break
        else:
            break
        if p == start:
            break
        contour.append(p)
    return np.array(contour, dtype=np.float64)[:, ::-1]   # -> (x, y)


def normals(pts, solid, span=6):
    """Inward unit normals along the contour."""
    t = np.roll(pts, -span, axis=0) - np.roll(pts, span, axis=0)
    t /= np.maximum(np.hypot(t[:, 0], t[:, 1]), 1e-6)[:, None]
    n = np.stack([-t[:, 1], t[:, 0]], axis=1)
    # Orient by vote rather than by assuming the walk's handedness.
    probe = bilinear(solid[..., None].astype(np.float64),
                     pts[:, 0] + n[:, 0] * 4, pts[:, 1] + n[:, 1] * 4)[:, 0]
    return n if probe.mean() > 0.5 else -n


def bilinear(img, x, y):
    """Bilinear sample of an H x W x C image at fractional x, y."""
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def belt_runs(pts, nrm, track):
    """Stretches of silhouette whose inward side is track paint, not hull."""
    probe = np.stack([bilinear(track[..., None].astype(np.float64),
                              pts[:, 0] + nrm[:, 0] * d, pts[:, 1] + nrm[:, 1] * d)[:, 0]
                      for d in (3, 8, 14)])
    is_belt = probe.mean(axis=0) > 0.6
    n = len(is_belt)
    if is_belt.all():
        return [(0, n)]
    start = int(np.argmin(is_belt))          # begin on a gap so runs stay whole
    runs = []
    for k in range(n):
        j = (start + k) % n
        if not is_belt[j]:
            continue
        if runs and runs[-1][1] == start + k:
            runs[-1] = (runs[-1][0], start + k + 1)
        else:
            runs.append((start + k, start + k + 1))
    return [(s % n, s % n + (e - s)) for s, e in runs if e - s >= MIN_RUN]


def blur_along(u, sigma):
    """Blur along the travel axis only, so radial structure survives."""
    rad = max(1, int(sigma * 2))
    k = np.exp(-0.5 * (np.arange(-rad, rad + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.pad(u, ((0, 0), (rad, rad), (0, 0)), mode="wrap")
    out = np.zeros_like(u)
    for i, wgt in enumerate(k):
        out += pad[:, i:i + u.shape[1]] * wgt
    return out


def pad_pitch(high, lo, hi):
    """Pad spacing, from the belt's self-similarity along travel."""
    sig = np.abs(high).mean(axis=(0, 2))
    sig -= sig.mean()
    score = np.array([float((sig * np.roll(sig, l)).mean()) for l in range(lo, hi)])
    # Take the FIRST strong peak, not the tallest: correlation at twice the pad
    # spacing is just as strong, and picking it would scroll two pads a cycle.
    for i in range(1, len(score) - 1):
        if (score[i] >= score[i - 1] and score[i] >= score[i + 1]
                and score[i] > score.max() * 0.7):
            return lo + i
    return lo + int(score.argmax())


def nearest_on_contour(pts, ys, xs, chunk=4096):
    """Index of, and distance to, the closest contour point for each pixel."""
    idx = np.empty(len(ys), np.int32)
    dist = np.empty(len(ys), np.float64)
    for i in range(0, len(ys), chunk):
        dx = xs[i:i + chunk, None] - pts[None, :, 0]
        dy = ys[i:i + chunk, None] - pts[None, :, 1]
        d2 = dx * dx + dy * dy
        k = d2.argmin(axis=1)
        idx[i:i + chunk] = k
        dist[i:i + chunk] = np.sqrt(d2[np.arange(len(k)), k])
    return idx, dist


class Belt:
    """One stretch of tread: unwrapped for reading, inverse-mapped for writing."""

    def __init__(self, pts, nrm, start, end):
        self.start, self.span = start, end - start
        self.idx = np.arange(start, end) % len(pts)
        self.pts, self.nrm = pts, nrm

    def unwrap(self, rgb):
        """Straighten the band into a (depth, travel) grid and split it."""
        cols = np.arange(0, self.span, 1.0 / SAMPLE)
        base = self.pts[(self.start + cols).astype(int) % len(self.pts)]
        nn = self.nrm[(self.start + cols).astype(int) % len(self.pts)]
        depth = np.arange(0, BAND_DEPTH, 1.0 / SAMPLE)
        x = base[None, :, 0] + nn[None, :, 0] * depth[:, None]
        y = base[None, :, 1] + nn[None, :, 1] * depth[:, None]
        u = bilinear(rgb, x, y)
        # Measure the pad spacing off a rough split, then re-split with a blur
        # wide enough that no pad ghost is left behind in the static layer.
        self.pitch = pad_pitch(u - blur_along(u, 18 * SAMPLE), 8 * SAMPLE, 44 * SAMPLE)
        self.low = blur_along(u, 1.1 * self.pitch)
        self.high = u - self.low
        # Snap the pitch so a whole number of pads spans the run: the scroll
        # wraps at the run's ends, and matching phase there hides the join.
        self.step = self.high.shape[1] / max(1, round(self.high.shape[1] / self.pitch))

    def claim(self, pts, ys, xs, idx, dist):
        """Take the band pixels whose nearest contour point is inside this run."""
        rel = (idx - self.start) % len(pts)
        mine = (rel < self.span) & (dist <= BAND_DEPTH - 1)
        self.py, self.px = ys[mine], xs[mine]
        self.col = rel[mine] * SAMPLE
        self.row = dist[mine] * SAMPLE
        return mine

    def scroll(self, out, frac):
        """Paint the belt with its pads advanced `frac` of one pad pitch."""
        shift = frac * self.step
        ahead = grid_sample(self.high, self.row, self.col + shift)
        behind = grid_sample(self.high, self.row, self.col + shift - self.step)
        # Perspective makes the pads only *roughly* evenly spaced, so a shift of
        # one pitch isn't quite the identity and the cycle would jolt as it wraps.
        # Cross-fading into the same pattern one pitch back closes the loop
        # exactly; where the spacing drifts it costs a little ghosting instead.
        detail = ahead * (1 - frac) + behind * frac
        out[self.py, self.px] = grid_sample(self.low, self.row, self.col) + detail


def grid_sample(grid, row, col):
    """Bilinear read from an unwrap grid; travel wraps, depth clamps."""
    d, s = grid.shape[:2]
    row = np.clip(row, 0, d - 1.001)
    r0 = np.floor(row).astype(int)
    fr = (row - r0)[:, None]
    r1 = np.minimum(r0 + 1, d - 1)
    col = col % s
    c0 = np.floor(col).astype(int)
    fc = (col - c0)[:, None]
    c1 = (c0 + 1) % s
    return (grid[r0, c0] * (1 - fr) * (1 - fc) + grid[r0, c1] * (1 - fr) * fc
            + grid[r1, c0] * fr * (1 - fc) + grid[r1, c1] * fr * fc)


def label(mask):
    """Connected components as (area, x0, y0, x1, y1)."""
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    out = []
    for y0, x0 in zip(*np.where(mask)):
        if seen[y0, x0]:
            continue
        q, n, bx = deque([(y0, x0)]), 0, [w, h, 0, 0]
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            n += 1
            bx[0], bx[1] = min(bx[0], x), min(bx[1], y)
            bx[2], bx[3] = max(bx[2], x), max(bx[3], y)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if n > 200:
            out.append((n, *bx))
    return out


def wheel_ellipses(wheel, h):
    """Road wheels as ellipses — the 3/4 view foreshortens them horizontally."""
    found = []
    for _, x0, y0, x1, y1 in sorted(label(wheel), key=lambda b: -(b[4] - b[2])):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2
        if ry < h * 0.06 or not 1.2 < ry / max(rx, 1e-6) < 2.4:
            continue
        if any(abs(cx - d["cx"]) < d["rx"] for d in found):
            continue                          # rim and hub are separate blobs
        found.append({"cx": cx, "cy": cy, "rx": rx, "ry": ry})
    found.sort(key=lambda d: d["cx"])
    return found


def discs(wheels, w, h, grow=1.0):
    """Filled ellipse mask for the given wheels."""
    yy, xx = np.mgrid[0:h, 0:w]
    out = np.zeros((h, w), bool)
    for d in wheels:
        out |= (((xx - d["cx"]) / (d["rx"] * grow)) ** 2
                + ((yy - d["cy"]) / (d["ry"] * grow)) ** 2) <= 1.0
    return out


def build(team, src_dir):
    im = Image.open(os.path.join(src_dir, "leg-tank.webp")).convert("RGBA")
    s = min(1.0, FRAME_MAX / max(im.size))
    if s < 1.0:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    w, h = im.size
    a = np.asarray(im).astype(np.float64)
    solid, track, wheel = masks(a)
    _, warm = solid_warm(a)
    rgb, alpha = a[..., :3], a[..., 3]

    pts = trace_boundary(solid)
    nrm = normals(pts, solid)
    belts = [Belt(pts, nrm, s0, e0) for s0, e0 in belt_runs(pts, nrm, track)]
    if not belts:
        raise SystemExit(f"{team}: found no tread band — check the track mask")
    for belt in belts:
        belt.unwrap(rgb)

    # Candidates exclude the armour (never tread) and the rims (they spin at
    # runtime); each belt then claims the pixels nearest to its own run.
    wheels = wheel_ellipses(wheel, h)
    free = solid & ~warm & ~discs(wheels, w, h, grow=1.06)
    ys, xs = np.where(free)
    idx, dist = nearest_on_contour(pts, ys.astype(np.float64), xs.astype(np.float64))
    for belt in belts:
        belt.claim(pts, ys, xs, idx, dist)

    strip = Image.new("RGBA", (w * ROLL_FRAMES, h), (0, 0, 0, 0))
    for f in range(ROLL_FRAMES):
        out = rgb.copy()
        for belt in belts:
            belt.scroll(out, f / ROLL_FRAMES)
        pix = np.dstack([np.clip(out, 0, 255), alpha]).astype(np.uint8)
        strip.alpha_composite(Image.fromarray(pix), (f * w, 0))

    dst_dir = os.path.join(DST_ROOT, team)
    os.makedirs(dst_dir, exist_ok=True)
    out_path = os.path.join(dst_dir, "leg-tank-roll.webp")
    strip.save(out_path, "WEBP", quality=90, method=6)
    print(f"  {team}/leg-tank-roll.webp  {ROLL_FRAMES} frames  {strip.width}x{strip.height}"
          f"  {sum(b.py.size for b in belts)} belt px"
          f"  ({os.path.getsize(out_path) // 1024} KB)")

    pitch = float(np.mean([b.step for b in belts])) / SAMPLE
    return {
        "frames": ROLL_FRAMES,
        "pitchFrac": round(pitch / w, 5),
        "wheels": [{"x": round(d["cx"] / w, 5), "y": round(d["cy"] / h, 5),
                    "rx": round(d["rx"] / w, 5), "ry": round(d["ry"] / h, 5)}
                   for d in wheels],
    }


def main():
    geom = None
    for team, src_dir in SETS.items():
        if not os.path.isfile(os.path.join(src_dir, "leg-tank.webp")):
            print(f"  skip {team}: no leg-tank.webp")
            continue
        geom = build(team, src_dir) or geom
    if geom:
        path = os.path.join(DST_ROOT, "tank-roll.json")
        with open(path, "w") as fh:
            json.dump(geom, fh, indent=2)
            fh.write("\n")
        print(f"  {len(geom['wheels'])} wheels, pad pitch {geom['pitchFrac']:.4f} of frame"
              f"  -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
