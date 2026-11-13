"""Cut one of Scott's prints into a scenery background (2026-11-13).

Generalises train_yard.py for the prints he sends by hand:

  subway   an indoor platform (no sky): a 3:1 band through the train and the
           platform, its top feathered into Symphony's sky.
  skyline  the city and bridge, wide version: its flat blue sky keyed out
           (blue pixels connected to the top edge), a 3:1 band from the
           spires to the bridge deck.

Each also gets a heading picture: the whole print, uncut, for Today's
heading strip (HeadingPrint), where its own sky reads well.

Usage: uv run --with numpy --with scipy --with pillow python
  scripts/scenery/cut_print.py <subway|skyline> <source.png> <out-dir>
Writes <name>.png, <name>-veil.png, <name>-heading.png; convert to WebP with
cwebp. Prints the skyline.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

NAME, SRC, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
W, H = 2172, 724
FADE = round(64 * W / 1506)
CONFIG = {
    # top: the band's first row as a share of the source height; key: key the sky; feather: share of band height
    'subway': dict(top=0.33, key=False, feather=0.28),
    'skyline': dict(top=0.10, key=True, feather=0.0),
}[NAME]

src = Image.open(SRC).convert('RGB')
src.save(OUT / f'{NAME}-heading.png')
rgb = np.asarray(src).astype(float)
band_h = round(rgb.shape[1] * H / W)
top = round(CONFIG['top'] * rgb.shape[0])
rgb = rgb[top:top + band_h]
alpha = np.ones(rgb.shape[:2])
if CONFIG['key']:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blue = (b - r >= 60) & (b > 140) & (g > 90)
    labels, _ = ndi.label(blue)
    sky = np.isin(labels, np.unique(labels[0][labels[0] > 0]))
    # small inked islands floating in the sky (a gull) stay: they are art
    alpha = ndi.gaussian_filter((~sky).astype(float), 0.7)
if CONFIG['feather']:
    ramp = np.clip(np.arange(rgb.shape[0]) / (CONFIG['feather'] * rgb.shape[0]), 0, 1)
    alpha *= (ramp * ramp * (3 - 2 * ramp))[:, None]
rgba = np.dstack([rgb * alpha[..., None], alpha * 255]).clip(0, 255).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS)
pm = np.asarray(img).astype(float)
a = pm[..., 3:4]
pm[..., :3] = np.where(a > 0, pm[..., :3] * 255 / np.clip(a, 1e-3, None), 0)
art = pm.clip(0, 255).round().astype(np.uint8)
Image.fromarray(art, 'RGBA').save(OUT / f'{NAME}.png')

solid = ndi.binary_opening(art[..., 3] > 128, structure=np.ones((31, 31)))
first = np.where(solid.any(0), solid.argmax(0), H).astype(float)
env = ndi.gaussian_filter1d(ndi.minimum_filter1d(first, 81), 25)
yy = np.arange(H)[:, None].astype(float)
t = np.clip((yy - (env[None, :] - FADE)) / (0.8 * FADE), 0, 1)
veil = np.maximum(t * t * (3 - 2 * t), solid.astype(float))
Image.fromarray(np.dstack([np.full(veil.shape + (3,), 255.0), veil * 255]).round().astype(np.uint8), 'RGBA') \
    .save(OUT / f'{NAME}-veil.png')
middle = env[int(W * 0.2):int(W * 0.8)]
print(NAME, 'skyline', round(float(middle.min()) / H, 4))
