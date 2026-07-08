import { supabase } from '@/lib/supabase'

export interface TaskImage {
  id: string
  fileName: string
  url: string
}

/** Longest side of an uploaded JPEG — plenty for viewing/vision, kind to egress. */
const MAX_DIMENSION = 1600

export async function toJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      0.8,
    )
  })
}

/** Image attachments on a task (the `attachments` table + bucket), with
 *  short-lived signed URLs for display. */
export async function listTaskImages(taskId: string): Promise<TaskImage[]> {
  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, file_name, file_type, storage_path')
    .eq('entity_type', 'task')
    .eq('entity_id', taskId)
    .order('created_at', { ascending: true })
  if (error || !rows) return []

  const images: TaskImage[] = []
  for (const row of rows) {
    if (!row.file_type?.startsWith('image/')) continue
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(row.storage_path, 3600)
    if (data?.signedUrl) images.push({ id: row.id, fileName: row.file_name, url: data.signedUrl })
  }
  return images
}

/** Attach an image to an existing task: downscale → upload → attachments row. */
export async function attachImageToTask(taskId: string, image: Blob, fileName?: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not signed in')
    const jpeg = await toJpeg(image)
    const storagePath = `${user.id}/attach/${crypto.randomUUID()}.jpg`

    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, jpeg, { contentType: 'image/jpeg', upsert: false })
    if (uploadErr) throw new Error(uploadErr.message)

    const { error: insertErr } = await supabase.from('attachments').insert({
      user_id: user.id,
      entity_type: 'task',
      entity_id: taskId,
      file_name: fileName || 'photo.jpg',
      file_type: 'image/jpeg',
      file_size: jpeg.size,
      storage_path: storagePath,
    })
    if (insertErr) throw new Error(insertErr.message)
    return true
  } catch (err) {
    console.error('attachImageToTask failed:', err)
    return false
  }
}
