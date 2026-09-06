/** Longest side of an uploaded page/photo — plenty for vision, kind to egress. */
export const MAX_IMAGE_DIMENSION = 1600

/** Re-encode any image blob as a downscaled JPEG. */
export async function toJpeg(blob: Blob, maxDimension = MAX_IMAGE_DIMENSION): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      0.8,
    )
  })
}
