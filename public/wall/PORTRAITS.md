# Wall portraits

`portrait-<family_members.id>.png` — 240x240 watercolor portraits loaded by
`WallV2FamilyStrip.tsx` (falls back to the monogram medallion on load error).

| Person | family_members.id |
|--------|-------------------|
| Scott  | 4fd6259b-2246-4304-96c3-d93a12fd43ae |
| Iris   | 698227a4-1a01-43f0-b218-5c1307cf33ce |
| Ella   | cad5a788-e424-4b50-b7e8-fb35c4f11972 |
| Kaleb  | aa264b2e-c4ee-44a8-be07-9c0cbdaa7277 |

## Re-deriving at a different size

Master: `docs/superpowers/specs/assets/wall-portraits-source.jpg` — a 1254x1254
2x2 grid (Iris TL, Scott TR, Kaleb BL, Ella BR) with a ~10px white gutter at
x=627 / y=627. Tile crops that clear the gutter cleanly:

    magick source.jpg -crop 600x600+11+11   +repage iris.png
    magick source.jpg -crop 600x600+642+11  +repage scott.png
    magick source.jpg -crop 600x600+11+642  +repage kaleb.png
    magick source.jpg -crop 600x600+642+642 +repage ella.png

600px is the ceiling this master supports. If the person-lane redesign needs
larger, re-export from the original generation rather than upscaling.
