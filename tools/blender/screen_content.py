"""Synthetic screen images for the developer room (numpy RGB float arrays, top row first).

Everything is procedural decoration: no real code, hosts, addresses or personal data.
Kinds: code, terminal, dashboard, topology, htop.
"""
import math
import random

import numpy as np

BG = (0.010, 0.014, 0.024)
PANEL = (0.022, 0.028, 0.045)
GRID = (0.05, 0.06, 0.085)
CYAN = (0.26, 0.85, 1.0)
BLUE = (0.09, 0.41, 1.0)
ORANGE = (1.0, 0.54, 0.21)
GREEN = (0.24, 0.86, 0.52)
PURPLE = (0.62, 0.45, 0.98)
RED = (0.95, 0.3, 0.28)
TEXT = (0.85, 0.88, 0.93)
DIM = (0.35, 0.4, 0.48)


def canvas(w, h, color=BG):
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:] = color
    return img


def rect(img, x0, y0, x1, y1, color):
    h, w = img.shape[:2]
    x0, x1 = max(0, int(x0)), min(w, int(x1))
    y0, y1 = max(0, int(y0)), min(h, int(y1))
    if x1 > x0 and y1 > y0:
        img[y0:y1, x0:x1] = color


def line(img, x0, y0, x1, y1, color, t=2):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for k in range(n):
        f = k / max(1, n - 1)
        x, y = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
        rect(img, x - t / 2, y - t / 2, x + t / 2, y + t / 2, color)


def disc(img, cx, cy, r, color, ring=0):
    h, w = img.shape[:2]
    yy, xx = np.ogrid[max(0, int(cy - r)):min(h, int(cy + r) + 1), max(0, int(cx - r)):min(w, int(cx + r) + 1)]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    mask = (d <= r) & ((d >= r - ring) if ring else True)
    sub = img[max(0, int(cy - r)):min(h, int(cy + r) + 1), max(0, int(cx - r)):min(w, int(cx + r) + 1)]
    sub[mask] = color


def text_bar(img, x, y, length, height, color):
    """A 'word' drawn as a rounded bar (legible as text at screen distance, no real content)."""
    rect(img, x, y, x + length, y + height, color)


def code(w=1600, h=900, seed=1):
    r = random.Random(seed)
    img = canvas(w, h)
    rect(img, 0, 0, w * 0.18, h, (0.018, 0.022, 0.036))
    rect(img, 0, 0, w, h * 0.05, (0.03, 0.035, 0.05))
    palette = [CYAN, BLUE, ORANGE, DIM, TEXT, PURPLE]
    rh = h / 46
    for row in range(3, 46):
        y0 = row * rh + rh * 0.3
        text_bar(img, w * 0.19, y0, w * 0.025, rh * 0.38, (0.25, 0.28, 0.33))
        if r.random() < 0.12:
            continue
        x = w * 0.23 + r.randint(0, 4) * w * 0.022
        for _ in range(r.randint(1, 7)):
            tw = w * (0.02 + r.random() * 0.09)
            text_bar(img, x, y0, tw, rh * 0.38, palette[r.randrange(len(palette))])
            x += tw + w * 0.01
            if x > w * 0.95:
                break
    for row in range(4, 30):
        text_bar(img, w * 0.02, row * rh * 1.2, w * (0.03 + r.random() * 0.1), 4, DIM)
    return img


def terminal(w=1600, h=900, seed=2):
    r = random.Random(seed)
    img = canvas(w, h, (0.006, 0.009, 0.012))
    rect(img, 0, 0, w, h * 0.045, (0.04, 0.045, 0.06))
    for i, c in enumerate((RED, ORANGE, GREEN)):
        disc(img, 22 + i * 26, h * 0.0225, 7, c)
    rh = h / 40
    for row in range(2, 40):
        y0 = row * rh + rh * 0.3
        if r.random() < 0.3:  # prompt line
            text_bar(img, w * 0.02, y0, w * 0.06, rh * 0.42, GREEN)
            text_bar(img, w * 0.085, y0, w * 0.02, rh * 0.42, BLUE)
            text_bar(img, w * 0.11, y0, w * (0.08 + r.random() * 0.25), rh * 0.42, TEXT)
        else:
            x = w * 0.02
            for _ in range(r.randint(1, 8)):
                tw = w * (0.02 + r.random() * 0.07)
                col = GREEN if r.random() < 0.15 else (ORANGE if r.random() < 0.06 else DIM)
                text_bar(img, x, y0, tw, rh * 0.42, col)
                x += tw + w * 0.012
    rect(img, w * 0.11, 39 * rh + rh * 0.3, w * 0.12, 39 * rh + rh * 0.75, TEXT)  # cursor
    return img


def _sparkline(img, x0, y0, x1, y1, r, color, n=60, fill=False):
    pts = []
    v = r.random()
    for k in range(n):
        v = min(1, max(0, v + (r.random() - 0.5) * 0.25))
        pts.append((x0 + (x1 - x0) * k / (n - 1), y1 - (y1 - y0) * (0.1 + 0.8 * v)))
    if fill:
        for (xa, ya), (xb, _) in zip(pts, pts[1:]):
            rect(img, xa, ya, xb + 1, y1, tuple(c * 0.25 for c in color))
    for a, b in zip(pts, pts[1:]):
        line(img, *a, *b, color, 2)


def dashboard(w=1600, h=900, seed=3):
    """Monitoring-style dashboard: stat tiles, time series, bars, gauges."""
    r = random.Random(seed)
    img = canvas(w, h)
    rect(img, 0, 0, w, h * 0.06, PANEL)
    text_bar(img, w * 0.02, h * 0.02, w * 0.12, h * 0.022, TEXT)
    pad = w * 0.012
    cols, rows = 4, 3
    cw, ch = (w - pad * (cols + 1)) / cols, (h * 0.94 - pad * (rows + 1)) / rows
    accents = [CYAN, GREEN, ORANGE, PURPLE, BLUE]
    for gy in range(rows):
        for gx in range(cols):
            x0 = pad + gx * (cw + pad)
            y0 = h * 0.06 + pad + gy * (ch + pad)
            rect(img, x0, y0, x0 + cw, y0 + ch, PANEL)
            text_bar(img, x0 + pad, y0 + pad, cw * 0.4, h * 0.014, DIM)
            acc = accents[(gx + gy * 2) % len(accents)]
            kind = (gx + gy) % 4 if gy else 0
            ix0, iy0, ix1, iy1 = x0 + pad, y0 + pad * 3, x0 + cw - pad, y0 + ch - pad
            if kind == 0:  # big stat
                text_bar(img, ix0, iy0 + (iy1 - iy0) * 0.25, cw * (0.35 + r.random() * 0.25), (iy1 - iy0) * 0.35, acc)
                _sparkline(img, ix0, iy0 + (iy1 - iy0) * 0.7, ix1, iy1, r, acc, n=30)
            elif kind == 1:  # time series
                for k in range(5):
                    rect(img, ix0, iy0 + (iy1 - iy0) * k / 4, ix1, iy0 + (iy1 - iy0) * k / 4 + 1, GRID)
                _sparkline(img, ix0, iy0, ix1, iy1, r, acc, fill=True)
                _sparkline(img, ix0, iy0, ix1, iy1, r, BLUE)
            elif kind == 2:  # bars
                n = 14
                bw = (ix1 - ix0) / n
                for k in range(n):
                    bh = (iy1 - iy0) * (0.15 + r.random() * 0.8)
                    rect(img, ix0 + k * bw + 2, iy1 - bh, ix0 + (k + 1) * bw - 2, iy1, acc if r.random() > 0.15 else ORANGE)
            else:  # gauge
                cx, cy, rad = (ix0 + ix1) / 2, (iy0 + iy1) / 2 + (iy1 - iy0) * 0.1, min(ix1 - ix0, iy1 - iy0) * 0.42
                disc(img, cx, cy, rad, GRID, ring=rad * 0.18)
                frac = 0.3 + r.random() * 0.6
                for k in range(int(220 * frac)):
                    a = math.radians(160 + k)
                    rect(img, cx + math.cos(a) * rad * 0.91 - 3, cy + math.sin(a) * rad * 0.91 - 3, cx + math.cos(a) * rad * 0.91 + 3, cy + math.sin(a) * rad * 0.91 + 3, acc)
                text_bar(img, cx - rad * 0.35, cy - rad * 0.12, rad * 0.7, rad * 0.24, TEXT)
    return img


def topology(w=1600, h=900, seed=4):
    """Network map: core → switches → servers/devices, with status colours."""
    r = random.Random(seed)
    img = canvas(w, h)
    for x in range(0, w, 40):
        rect(img, x, 0, x + 1, h, (0.02, 0.026, 0.04))
    for y in range(0, h, 40):
        rect(img, 0, y, w, y + 1, (0.02, 0.026, 0.04))
    core = (w * 0.5, h * 0.16)
    switches = [(w * (0.18 + 0.32 * k), h * 0.45) for k in range(3)]
    leaves = []
    for sx, sy in switches:
        for k in range(5):
            leaves.append((sx + (k - 2) * w * 0.06, h * (0.76 + 0.04 * (k % 2)), (sx, sy)))
    for s in switches:
        line(img, *core, *s, CYAN, 3)
    for lx, ly, (sx, sy) in leaves:
        line(img, sx, sy, lx, ly, BLUE, 2)
    for lx, ly, _ in leaves:
        c = GREEN if r.random() > 0.12 else ORANGE
        disc(img, lx, ly, 14, PANEL)
        disc(img, lx, ly, 14, c, ring=3)
        text_bar(img, lx - 22, ly + 22, 44, 7, DIM)
    for sx, sy in switches:
        rect(img, sx - 46, sy - 20, sx + 46, sy + 20, PANEL)
        rect(img, sx - 46, sy - 20, sx + 46, sy - 16, CYAN)
        for p in range(8):
            rect(img, sx - 38 + p * 10, sy - 4, sx - 32 + p * 10, sy + 4, GREEN if r.random() > 0.2 else DIM)
    disc(img, *core, 34, PANEL)
    disc(img, *core, 34, CYAN, ring=5)
    disc(img, *core, 10, CYAN)
    rect(img, w * 0.78, h * 0.05, w * 0.97, h * 0.3, PANEL)
    for k in range(6):
        text_bar(img, w * 0.79, h * (0.07 + k * 0.035), w * (0.05 + r.random() * 0.1), h * 0.012, [GREEN, CYAN, DIM][k % 3])
    return img


def htop(w=1600, h=900, seed=5):
    r = random.Random(seed)
    img = canvas(w, h, (0.006, 0.009, 0.012))
    for k in range(16):  # per-core meters
        col, row = k % 2, k // 2
        x0, y0 = w * (0.02 + col * 0.49), h * (0.03 + row * 0.035)
        rect(img, x0, y0, x0 + w * 0.45, y0 + h * 0.022, (0.04, 0.05, 0.06))
        f = r.random()
        rect(img, x0, y0, x0 + w * 0.45 * f * 0.6, y0 + h * 0.022, GREEN)
        rect(img, x0 + w * 0.45 * f * 0.6, y0, x0 + w * 0.45 * f * 0.8, y0 + h * 0.022, RED)
    y = h * 0.34
    rect(img, 0, y, w, y + h * 0.03, (0.1, 0.55, 0.4))
    for row in range(1, 24):
        yy = y + row * h * 0.028
        x = w * 0.01
        for k, frac in enumerate((0.05, 0.06, 0.04, 0.05, 0.05, 0.04, 0.05, 0.3)):
            text_bar(img, x, yy + 4, w * frac * (0.6 + r.random() * 0.4), h * 0.012, CYAN if k == 7 and r.random() < 0.3 else DIM)
            x += w * (frac + 0.02)
    return img


GENERATORS = {"code": code, "terminal": terminal, "dashboard": dashboard, "topology": topology, "htop": htop}


def make(kind, w, h, seed):
    return GENERATORS[kind](w, h, seed)
