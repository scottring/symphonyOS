"""Cut Scott's mountain-overlook print into the Woodblock "Small Mountain Town" art.

The source (2026-10-30) is a single 1200x1200 woodblock-style painting: a
letterboxed vista of snowy peaks over a river valley, seen from a pine-topped
cliff. It replaces all three lights of the woodblock mountain town; there is
no dusk or night version, so one picture serves every light.

Steps:
  1. drop the black letterbox and key the painted sky to transparency (the
     sky is the smooth region connected to the top; the print's ink outlines
     stop it at the peaks);
  2. scale to the woodblock set's 2172px width and place it in a 2172x724
     band so the land's median top sits at row 262 (chosen against the old
     art on Scott's Today page: the peaks, the river and the pine all show);
  3. sink the far horizon in the middle, as the old art's skyline dips there,
     with a displacement that is full at the horizon and fades to nothing at
     the bottom edge, so the cliffs and pines in front do not move;
  4. write the veil (where page content is concealed: under the skyline,
     fading in over FADE px above it) and the skyline fraction for panoramas.ts.

Usage: uv run --with numpy --with scipy --with pillow python
  scripts/scenery/woodblock_mountain_overlook.py <source.png> <out-dir>
Writes mountain-overlook.png and mountain-overlook-veil.png; convert both to
WebP with cwebp. Prints the skyline.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

W, H = 2172, 724          # the woodblock set's band size
LAND_TOP = 262            # the land's median top row in the band
DIP, DIP_WIDTH = 70, 0.20  # how far the horizon sinks mid-band, and over how wide a share
FADE = round(64 * W / 1506)  # extract_landscapes.py's FADE, at this width


def key_sky(rgb):
    """Alpha for the land: everything not connected to the sky at the top."""
    g = np.sqrt((ndi.sobel(rgb, axis=0) ** 2 + ndi.sobel(rgb, axis=1) ** 2).sum(2))
    smooth = g < 300          # paper grain stays under it; ink outlines do not
    smooth[260:] = False      # nothing that low is sky
    labels, _ = ndi.label(smooth)
    sky = np.isin(labels, list(set(np.unique(labels[60])) - {0}))
    sky = ndi.binary_closing(sky, iterations=2, border_value=1)
    sky[:140] = True          # the deep-blue top band is all sky
    return ndi.gaussian_filter((~sky).astype(float), 0.8)


def envelope(alpha):
    solid = alpha > 0.5
    first = np.where(solid.any(0), solid.argmax(0), alpha.shape[0]).astype(float)
    return ndi.gaussian_filter1d(ndi.minimum_filter1d(first, 81), 25)


rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
rows = np.where(rgb.mean(2).mean(1) > 25)[0]
rgb = rgb[rows.min() + 2:rows.max() - 1]
alpha = key_sky(rgb)

# Scale to the band's width, premultiplied so the keyed edge carries no sky.
rgba = np.dstack([rgb * alpha[..., None], alpha * 255]).clip(0, 255).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
img = img.resize((W, round(img.height * W / img.width)), Image.LANCZOS)
pm = np.asarray(img).astype(float)
offset = int(np.median(envelope(pm[..., 3] / 255))) - LAND_TOP

# One remap does both the placement and the dip.
x = np.arange(W) / W
dip = DIP * np.exp(-((x - 0.5) / DIP_WIDTH) ** 2)
yy, xx = np.mgrid[0:H, 0:W].astype(float)
weight = np.clip((H - yy) / (H - 250), 0, 1)  # full from row 250 up
src = yy + offset - dip[None, :] * weight
out = np.dstack([ndi.map_coordinates(pm[..., c], [src, xx], order=1, mode='nearest') for c in range(4)])
a = out[..., 3:4]
out[..., :3] = np.where(a > 0.5, out[..., :3] * 255 / np.clip(a, 1e-3, None), 0)
out[..., 3] = np.where(src[..., None] < 0, 0, a)[..., 0]
art = out.clip(0, 255).round().astype(np.uint8)
Image.fromarray(art, 'RGBA').save(OUT / 'mountain-overlook.png')

land = art[..., 3] / 255.0
env = envelope(land)
t = np.clip((yy - (env[None, :] - FADE)) / (0.8 * FADE), 0, 1)
veil = np.maximum(t * t * (3 - 2 * t), land)
Image.fromarray(np.dstack([np.full(veil.shape + (3,), 255.0), veil * 255]).round().astype(np.uint8), 'RGBA') \
    .save(OUT / 'mountain-overlook-veil.png')
middle = env[int(W * 0.2):int(W * 0.8)]
print('skyline', round(float(middle.min()) / H, 4))
