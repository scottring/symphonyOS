"""Cut Scott's train-yard print into a scenery background.

The source (2026-11-11) is a single ~1932px square print: white commuter
trains with red stripes fanning out under catenary gantries, a city and
cumulus sky behind, inside a cream paper margin. It is a background of its
own (choosable from the scenery dial), one picture for every light and style.

A square picture cannot stand full width in the scenery's 3:1 band without
losing its subject, so the band is the bottom of the print: the four train
faces and the cars behind them. Its top fades into the sky rather than being
keyed (the gantries and clouds lie above the band).

Steps:
  1. crop inside the print's rounded frame;
  2. take the bottom 3:1 of it and scale to the woodblock set's 2172x724;
  3. fade the band's top in over FADE_SHARE of its height (smoothstep);
  4. write the veil (the same alpha: page content is concealed where the art
     is) and print the skyline (where the fade is half way) for panoramas.ts.

Usage: uv run --with numpy --with pillow python
  scripts/scenery/train_yard.py <source.png> <out-dir>
Writes train-yard.png and train-yard-veil.png; convert both to WebP with
cwebp. Prints the skyline.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

W, H = 2172, 724                 # the woodblock set's band size
FRAME = (64, 78, 1866, 1890)     # inside the print's rounded frame (l, t, r, b)
FADE_SHARE = 0.24                # how much of the band's top fades in

img = Image.open(SRC).convert('RGB').crop(FRAME)
band_h = round(img.width * H / W)
img = img.crop((0, img.height - band_h, img.width, img.height)).resize((W, H), Image.LANCZOS)
rgb = np.asarray(img).astype(float)

t = np.clip(np.arange(H) / (FADE_SHARE * H), 0, 1)
alpha = np.broadcast_to((t * t * (3 - 2 * t))[:, None], (H, W))
Image.fromarray(np.dstack([rgb, alpha * 255]).round().astype(np.uint8), 'RGBA').save(OUT / 'train-yard.png')
Image.fromarray(np.dstack([np.full((H, W, 3), 255.0), alpha * 255]).round().astype(np.uint8), 'RGBA') \
    .save(OUT / 'train-yard-veil.png')
print('skyline', round(FADE_SHARE / 2, 4))
