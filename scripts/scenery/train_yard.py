"""Cut Scott's train-yard print into a scenery background.

The source (2026-11-11) is a single ~1932px square print: white commuter
trains with red stripes fanning out under catenary gantries, a city and
cumulus sky behind, inside a cream paper margin. It is a background of its
own (choosable from the scenery dial), one picture for every light and style.

A square picture cannot stand full width in the scenery's 3:1 band whole.
The band is the MIDDLE of the print (Scott, 2026-11-12: "we need the trains
to be visible, not the wires"; the top, with the wires, was 2026-11-11's):
the fan of curving trains below the gantries, one train's face at the left.
Nothing in it is sky, so its top is feathered into Symphony's own sky.

Steps:
  1. crop inside the print's rounded frame;
  2. key the sky (none in the middle band): above the city line, every sky-blue or pale cloud pixel
     (the print is flat colour, so no connectivity is needed — the dark
     poles, wires and gantries are never sky-coloured), then drop the small
     specks left by cloud outlines;
  3. take the 3:1 band from TOP, feather its top FEATHER of its height into
     the sky, and scale to the woodblock set's 2172x724;
  4. write the veil and the skyline, both measured on the land with the thin
     wires and poles opened away (they draw over the page; they do not
     conceal it).

Usage: uv run --with numpy --with scipy --with pillow python
  scripts/scenery/train_yard.py <source.png> <out-dir>
Writes train-yard.png and train-yard-veil.png; convert both to WebP with
cwebp. Prints the skyline.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

W, H = 2172, 724                 # the woodblock set's band size
FRAME = (64, 78, 1866, 1890)     # inside the print's rounded frame (l, t, r, b)
TOP = 800                        # the band's top row in the framed print (below the gantries)
FEATHER = 0.28                   # share of the band's height its top fades over
CITY = 690                       # nothing below this row is sky
FADE = round(64 * W / 1506)      # extract_landscapes.py's FADE, at this width

rgb = np.asarray(Image.open(SRC).convert('RGB').crop(FRAME)).astype(float)
band_h = round(rgb.shape[1] * H / W)
rgb = rgb[TOP:TOP + band_h]
r, b = rgb[..., 0], rgb[..., 2]
mean = rgb.mean(2)
rows = np.arange(rgb.shape[0])[:, None] + TOP
sky = (((b - r >= 25) & (b > 170)) | ((mean > 185) & (np.abs(r - b) < 40))) & (rows < CITY)

# Cloud outlines leave specks of ink in the open sky: drop small land islands
# that lie wholly above the city.
land = ~sky
labels, n = ndi.label(land)
sizes = ndi.sum(land, labels, range(1, n + 1))
lowest = ndi.maximum(rows.repeat(rgb.shape[1], 1), labels, range(1, n + 1))
specks = [i + 1 for i in range(n) if sizes[i] < 400 and lowest[i] < CITY - 20]
land &= ~np.isin(labels, specks)
alpha = ndi.gaussian_filter(land.astype(float), 0.7)
ramp = np.clip(np.arange(rgb.shape[0]) / (FEATHER * rgb.shape[0]), 0, 1)
alpha *= (ramp * ramp * (3 - 2 * ramp))[:, None]

rgba = np.dstack([rgb * alpha[..., None], alpha * 255]).clip(0, 255).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS)
pm = np.asarray(img).astype(float)
a = pm[..., 3:4]
pm[..., :3] = np.where(a > 0, pm[..., :3] * 255 / np.clip(a, 1e-3, None), 0)
art = pm.clip(0, 255).round().astype(np.uint8)
Image.fromarray(art, 'RGBA').save(OUT / 'train-yard.png')

# The veil and skyline follow the solid land, not the wires above it.
solid = ndi.binary_opening(art[..., 3] > 128, structure=np.ones((31, 31)))
first = np.where(solid.any(0), solid.argmax(0), H).astype(float)
env = ndi.gaussian_filter1d(ndi.minimum_filter1d(first, 81), 25)
yy = np.arange(H)[:, None].astype(float)
t = np.clip((yy - (env[None, :] - FADE)) / (0.8 * FADE), 0, 1)
veil = np.maximum(t * t * (3 - 2 * t), solid.astype(float))
Image.fromarray(np.dstack([np.full(veil.shape + (3,), 255.0), veil * 255]).round().astype(np.uint8), 'RGBA') \
    .save(OUT / 'train-yard-veil.png')
middle = env[int(W * 0.2):int(W * 0.8)]
print('skyline', round(float(middle.min()) / H, 4))
