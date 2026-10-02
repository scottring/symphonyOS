"""Cut the low landscape out of the approved immersive scene concepts.

The 15 concepts (five places x Daytime, Dusk / Dawn, Nighttime) are full-page
mockups with sample UI baked in, so none of them can sit behind the app
whole. What CAN be used is the landscape along the bottom: it sits below
every baked-in heading and row, and above the baked-in footer line.

For each concept this script:
  1. scales it to the common 1506px width (two concepts came out 1200px);
  2. finds the baked-in footer labels ("Review today", "SYMPHONY",
     "Keyboard shortcuts · Help") and stops the band a few pixels above them,
     so no label survives and the bridge, river, gate and path stay whole;
  3. keys the painted sky to transparency, so the app's own sky (tinted to
     the place's palette in CSS) shows above the skyline. The sky is the
     smooth region connected to the top of the band; anything that is not
     ground-connected (clouds, stars) is sky too. Edge pixels are unmixed
     from the local sky colour so no halo of the old sky remains.

Nothing is stretched, tiled or repeated: each band is one continuous crop.

Usage (needs numpy, scipy and Pillow — e.g. `uv run --with numpy --with scipy
--with pillow python scripts/scenery/extract_landscapes.py <concepts-dir>
src/assets/scenery/painted`). <concepts-dir> holds <place>-<lighting>.png.
Writes <place>-<lighting>.png (lossless RGBA) and <place>-<lighting>-veil.png
(a half-size alpha mask: where the page's content is concealed) plus
bands.json; convert the PNGs to WebP with cwebp.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
DEBUG = Path(sys.argv[3]) if len(sys.argv) > 3 else None
if DEBUG:
    DEBUG.mkdir(parents=True, exist_ok=True)

PLACES = ['urban', 'small-city', 'mountain-town', 'cabin', 'farm']
LIGHTS = ['daytime', 'dusk-dawn', 'nighttime']
W, H = 1506, 1045
# The lowest baked-in UI above the landscape ("Everything you need, right
# here") ends near y=595 in every concept; the band starts below it.
Y_TOP = 610
# Footer labels: where to look for them.
LABEL_COLUMNS = [(195, 300), (690, 820), (1130, 1320)]
OPEN_HEIGHT = 9
HEADROOM = 70   # clear sky kept above the highest feature (source px)
FADE = 64       # how far above the skyline the veil starts to fade in


def footer_top(rgb):
    """First row of the baked-in footer labels: white text present in all
    three label columns for at least five consecutive rows. Two concepts
    (small-city nighttime, mountain-town dusk) were drawn without them."""
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


def key_sky(band, threshold):
    """Alpha for `band`: 0 for sky, 1 for ground, soft at the skyline."""
    smooth = ndi.gaussian_filter(band, sigma=(1.2, 1.2, 0))
    grad = np.zeros(band.shape[:2])
    for c in range(3):
        gx = ndi.sobel(smooth[..., c], axis=1)
        gy = ndi.sobel(smooth[..., c], axis=0)
        grad = np.maximum(grad, np.hypot(gx, gy) / 8)
    calm = grad < threshold
    labels, _ = ndi.label(calm)
    seeds = np.unique(labels[:3][labels[:3] > 0])
    sky = np.isin(labels, seeds)
    # Low cloud streaks lying along the horizon touch the hills; anything
    # under OPEN_HEIGHT px tall that is not part of a taller mass is sky.
    # (Posts, spires and tree tips are vertical, so they survive.)
    ground = ndi.binary_opening(~sky, structure=np.ones((OPEN_HEIGHT, 1), bool))
    # Ground is whatever non-sky region reaches the bottom of the band; any
    # island left floating in the sky (a cloud, a star) is sky.
    ground_labels, _ = ndi.label(ground)
    bottom = np.unique(ground_labels[-1][ground_labels[-1] > 0])
    ground = np.isin(ground_labels, bottom)
    # Close pinholes inside the ground.
    return ndi.binary_fill_holes(ground)


def matte(band, ground):
    """Alpha and unmixed colour along the skyline.

    Each skyline pixel is a blend of the sky just above it and the ground
    just below it; solve for how much is ground, and remove the sky part so
    no rim of the painted (bright, hazy) horizon survives on the app's sky.
    """
    inside = ndi.distance_transform_edt(ground)
    outside = ndi.distance_transform_edt(~ground)
    sky_core = outside >= 3
    ground_core = inside >= 4
    s_idx = ndi.distance_transform_edt(~sky_core, return_distances=False, return_indices=True)
    g_idx = ndi.distance_transform_edt(~ground_core, return_distances=False, return_indices=True)
    S = band[s_idx[0], s_idx[1]]
    F = band[g_idx[0], g_idx[1]]
    d = F - S
    dd = (d * d).sum(2)
    proj = ((band - S) * d).sum(2) / np.maximum(dd, 1)
    soft = ndi.gaussian_filter(ground.astype(float), 0.7)
    alpha = np.where(dd > 25 ** 2, np.clip(proj, 0, 1), soft)
    alpha = np.where(inside > 3, 1.0, alpha)   # solid interior
    alpha = np.where(ground, alpha, 0.0)       # nothing outside the skyline
    # A one-pixel blur keeps the solved edge from looking cut out.
    alpha = np.where(inside > 3, 1.0, ndi.gaussian_filter(alpha, 0.5))
    a = alpha[..., None]
    fg = np.where(a > 0.05, (band - (1 - a) * S) / np.maximum(a, 0.05), F)
    return alpha, np.clip(fg, 0, 255)


def veil_for(alpha):
    """Where page content is hidden: everything under the skyline, fading in
    over FADE px above it. The skyline is taken as a smoothed upper envelope
    so the veil does not flicker in and out between treetops. Also returns
    how far down the band the skyline sits across its middle 60% (the part
    under the page's text column), as a fraction of the band's height."""
    h, w = alpha.shape
    solid = alpha > 0.5
    first = np.where(solid.any(0), solid.argmax(0), h).astype(float)
    envelope = ndi.gaussian_filter1d(ndi.minimum_filter1d(first, 81), 25)
    y = np.arange(h)[:, None]
    t = np.clip((y - (envelope[None, :] - FADE)) / (0.8 * FADE), 0, 1)
    veil = np.maximum(t * t * (3 - 2 * t), alpha)
    middle = envelope[int(w * 0.2):int(w * 0.8)]
    return veil, float(middle.min()) / h


report = {}
for place in PLACES:
    for light in LIGHTS:
        img = Image.open(SRC / f'{place}-{light}.png').convert('RGB')
        if img.size != (W, H):
            img = img.resize((W, H), Image.LANCZOS)
        rgb = np.asarray(img).astype(float)
        labels = footer_top(rgb)
        bottom = labels - 6 if labels else H
        band = rgb[Y_TOP:bottom]
        threshold = 5.0 if light != 'nighttime' else 4.0
        ground = key_sky(band, threshold)
        alpha, fg = matte(band, ground)
        # Trim empty sky rows from the top, then add HEADROOM rows of clear
        # sky: room for the veil to fade in above the highest treetop.
        rows = np.where(alpha.max(1) > 0.02)[0]
        top = int(rows.min())
        fg, alpha = fg[top:], alpha[top:]
        fg = np.vstack([np.repeat(fg[:1], HEADROOM, 0), fg])
        alpha = np.vstack([np.zeros((HEADROOM, W)), alpha])
        rgba = np.dstack([fg, alpha * 255]).round().astype(np.uint8)
        name = f'{place}-{light}'
        Image.fromarray(rgba, 'RGBA').save(OUT / f'{name}.png')
        veil, center = veil_for(alpha)
        Image.fromarray(np.dstack([np.full(veil.shape + (3,), 255.0), veil * 255]).round().astype(np.uint8), 'RGBA') \
            .resize((W // 2, veil.shape[0] // 2), Image.LANCZOS).save(OUT / f'{name}-veil.png')
        report[name] = {'source_rows': [Y_TOP + top, bottom], 'size': [W, rgba.shape[0]],
                        'center_skyline': round(center, 4)}
        if DEBUG:
            check = np.array([255, 0, 255], float)
            comp = rgba[..., :3] * (rgba[..., 3:] / 255) + check * (1 - rgba[..., 3:] / 255)
            Image.fromarray(comp.astype(np.uint8)).save(DEBUG / f'{name}-key.png')
        print(name, report[name])

(OUT / 'bands.json').write_text(json.dumps(report, indent=2) + '\n')
