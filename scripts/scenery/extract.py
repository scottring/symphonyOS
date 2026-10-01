"""Extract text-free scenery from the five generated theme concepts.

Each concept is a full-page mockup with UI text baked in. The illustration
is taken only from regions the UI never touched: below the task column,
beside the right column, and above the footer line. The paper-coloured sky
is keyed to transparency so the art sits on any page tint, and each half
fades out on its inner edge so the centre stays clear.

Usage (needs Pillow + numpy):
    python scripts/scenery/extract.py <concepts-dir> src/assets/scenery

<concepts-dir> holds urban.png, small-city.png, mountain-town.png, cabin.png
and farm.png — the 1200x981 generated concepts reviewed 2026-09-30 (kept
outside the repo). The crop boxes below are specific to those images.
Heights printed per theme go into SCENERY in PlaceScenery.tsx.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

# Window content box inside every concept (1200x981 canvas).
X0, X1 = 86, 1114
Y_TOP = 380          # nothing taller than this is kept
Y_BOTTOM = 866       # just above the baked-in footer text
PAPER = np.array([249.0, 247.0, 235.0])

# UI regions (canvas coords) that held text in the concepts. Art inside them
# is dropped; the edge is feathered so nothing ends in a hard vertical cut.
UI_HOLES = [
    (276, Y_TOP, 732, 650),   # task list + schedule column
    (732, Y_TOP, 922, 420),   # right column (week, routines)
]
FEATHER = 22


def ui_mask(w, h):
    m = Image.new('L', (w, h), 255)
    px = np.array(m, dtype=np.float32)
    for (a, b, c, d) in UI_HOLES:
        px[max(0, b - Y_TOP):max(0, d - Y_TOP), max(0, a - X0):max(0, c - X0)] = 0
    m = Image.fromarray(px.astype(np.uint8)).filter(ImageFilter.GaussianBlur(FEATHER / 2))
    # Blur bleeds art back into the hole; keep the hole itself fully clear.
    arr = np.array(m, dtype=np.float32)
    for (a, b, c, d) in UI_HOLES:
        arr[max(0, b - Y_TOP):max(0, d - Y_TOP), max(0, a - X0):max(0, c - X0)] = 0
    return arr / 255.0


def key_paper(rgb):
    diff = rgb - PAPER
    dist = np.sqrt((diff ** 2).sum(axis=2))
    t0, t1 = 7.0, 46.0
    a = np.clip((dist - t0) / (t1 - t0), 0, 1)
    a = a * a * (3 - 2 * a)  # smoothstep
    safe = np.maximum(a, 1e-3)[..., None]
    color = PAPER + diff / safe
    color = np.where(a[..., None] > 1e-3, color, PAPER)
    return np.clip(color, 0, 255), a


def inner_fade(w, side, start=0.52):
    x = np.linspace(0, 1, w)
    if side == 'left':
        t = np.clip((x - start) / (1 - start), 0, 1)
    else:
        t = np.clip(((1 - x) - start) / (1 - start), 0, 1)
    return 1 - t * t * (3 - 2 * t)


meta = {}
for theme in ['urban', 'small-city', 'mountain-town', 'cabin', 'farm']:
    im = Image.open(SRC / f'{theme}.png').convert('RGB').crop((X0, Y_TOP, X1, Y_BOTTOM))
    rgb = np.array(im, dtype=np.float32)
    color, alpha = key_paper(rgb)
    alpha = alpha * ui_mask(im.width, im.height)
    # Calm it a touch: less saturation, lifted toward the paper.
    lum = (color * np.array([0.299, 0.587, 0.114])).sum(axis=2, keepdims=True)
    color = lum + (color - lum) * 0.86
    color = color * 0.94 + PAPER * 0.06

    # Trim empty sky rows off the top (shared by both halves).
    rows = np.where(alpha.max(axis=1) > 0.04)[0]
    top = int(rows[0]) if len(rows) else 0
    color, alpha = color[top:], alpha[top:]
    h, w = alpha.shape
    half = w // 2
    meta[theme] = {'height': h, 'halfWidth': half, 'top': Y_TOP + top}
    for side, sl in (('left', slice(0, half)), ('right', slice(w - half, w))):
        a = alpha[:, sl] * inner_fade(half, side)[None, :]
        rgba = np.dstack([color[:, sl], a * 255]).astype(np.uint8)
        img = Image.fromarray(rgba, 'RGBA')
        img.save(OUT / f'{theme}-{side}.webp', 'WEBP', quality=84, method=6, exact=False)
    print(theme, meta[theme])

