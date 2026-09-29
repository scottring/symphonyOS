// A photographed page → the JPEGs the reader gets. A landscape photo is
// usually a two-page spread, so its halves go too: each half at full detail
// is what makes small handwriting legible, and the whole photo keeps the
// spread's layout.

export interface PreparedImage {
  part: 'whole' | 'left' | 'right'
  blob: Blob
}

const WHOLE_EDGE = 2400
const HALF_EDGE = 2000

async function encode(bmp: ImageBitmap, sx: number, sw: number, maxEdge: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(sw, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, sx, 0, sw, bmp.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error('encode failed')
  return blob
}

/** A spread when clearly wider than tall. */
export function isSpread(width: number, height: number): boolean {
  return width > height * 1.15
}

export async function prepareImages(file: Blob): Promise<PreparedImage[]> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const whole = { part: 'whole' as const, blob: await encode(bmp, 0, bmp.width, WHOLE_EDGE) }
    if (!isSpread(bmp.width, bmp.height)) return [whole]
    const half = Math.floor(bmp.width / 2)
    return [
      whole,
      { part: 'left', blob: await encode(bmp, 0, half, HALF_EDGE) },
      { part: 'right', blob: await encode(bmp, half, bmp.width - half, HALF_EDGE) },
    ]
  } finally {
    bmp.close()
  }
}
