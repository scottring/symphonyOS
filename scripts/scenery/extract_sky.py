"""Lift the painted sky out of a scene concept, for styles that keep their own
sky (the woodblock set, 2026-10-01).

The painted style keys its sky out and lets the app draw a gradient tinted to
the place. A woodblock print's sky IS the print — the Prussian-blue band, the
banded clouds, the paper — so for that style the concept's sky becomes the
page background. The concepts have sample UI baked into the sky (the date,
headings, rows, initials), so this script paints that UI out:

  1. inside the UI box (the template's text column), a pixel is UI if it is
     darker than its row's sky (read outside the column) — clouds are
     lighter, so they stay — plus fixed cells (initials, checkbox faces);
  2. the mask grows a few pixels to take the text's anti-aliasing with it;
  3. each hole is filled with the sky's smooth colour field across it, plus
     the paper's grain copied from clean sky in the same row, so the fill
     neither seams against the gradient nor reads as flat.

The plate runs from the top of the concept down to the same bottom row as
the landscape band (extract_landscapes.py), so the two line up when both are
drawn full width and anchored to the bottom of the window.

Usage: uv run --with numpy --with scipy --with pillow python
  scripts/scenery/extract_sky.py <concepts-dir> <out-dir> [<place>-<lighting> ...]
Writes <place>-<lighting>-sky.png; convert to WebP with cwebp.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
NAMES = sys.argv[3:] or [p.stem for p in sorted(SRC.glob('*.png'))]

W, H = 1506, 1045
# The template's text column and the rows it occupies.
BOX_X, BOX_Y = (190, 1316), (8, 612)
# Cells always painted out: the initials column at the right of the sample
# rows, and the checkboxes' light faces.
FIXED = [((1250, 1312), (280, 470)), ((200, 240), (288, 462)), ((288, 330), (548, 592))]
LABEL_COLUMNS = [(195, 300), (690, 820), (1130, 1320)]
STRIDE = 151


def footer_top(rgb):
    """Same rule as extract_landscapes.py: the first row of the footer labels."""
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    rows = None
    for x0, x1 in LABEL_COLUMNS:
        hit = ((lum[:, x0:x1] > 200) & (sat[:, x0:x1] < 60)).sum(1) >= 4
        rows = hit if rows is None else rows & hit
    run = 0
    for y in range(940, H):
        run = run + 1 if rows[y] else 0
        if run == 5:
            return y - 4
    return None


for name in NAMES:
    img = Image.open(SRC / f'{name}.png').convert('RGB')
    if img.size != (W, H):
        img = img.resize((W, H), Image.LANCZOS)
    rgb = np.asarray(img).astype(float)
    labels = footer_top(rgb)
    bottom = labels - 6 if labels else H

    # Each row's sky, read OUTSIDE the text column: inside it the template's
    # hairlines run three quarters of the width, so a whole-row median would
    # take the line's grey for the sky's colour.
    clean = np.concatenate([rgb[:, :BOX_X[0] - 5], rgb[:, BOX_X[1] + 5:]], axis=1)
    ref = np.median(clean, axis=1).mean(1)[:, None]
    # UI is DARKER than the sky (text, hairlines, checkbox borders); clouds
    # are lighter and stay. Fixed cells take what is light (initials,
    # checkbox faces).
    mask = np.zeros((H, W), bool)
    (x0, x1), (y0, y1) = BOX_X, BOX_Y
    mask[y0:y1, x0:x1] = (rgb.mean(2) < ref - 14)[y0:y1, x0:x1]
    for (cx0, cx1), (cy0, cy1) in FIXED:
        mask[cy0:cy1, cx0:cx1] = True
    mask = ndi.binary_dilation(mask, iterations=4)

    # Fill = the sky's smooth colour field across the hole (normalised
    # convolution of the clean pixels) + the paper's grain, lifted from the
    # nearest clean pixel a stride away in the same row.
    keep = (~mask).astype(float)
    low = np.dstack([ndi.gaussian_filter(rgb[..., c] * keep, 28) for c in range(3)])
    low /= np.maximum(ndi.gaussian_filter(keep, 28), 1e-6)[..., None]
    grain = rgb - np.dstack([ndi.gaussian_filter(rgb[..., c], 3) for c in range(3)])
    out = rgb.copy()
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        g = 0.0
        for k in (1, -1, 2, -2, 3, -3, 4, -4):
            sx = x + k * STRIDE
            if 0 <= sx < W and not mask[y, sx]:
                g = grain[y, sx]
                break
        out[y, x] = low[y, x] + g
    out = np.clip(out, 0, 255)

    Image.fromarray(out[:bottom].round().astype(np.uint8)).save(OUT / f'{name}-sky.png')
    print(name, {'rows': [0, bottom], 'masked': int(mask.sum())})
