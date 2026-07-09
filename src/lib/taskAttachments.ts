import { supabase } from '@/lib/supabase'

/** Entity kinds the `attachments` table accepts (its CHECK constraint). Events
 *  attach under 'event_note', keyed by the stable Google event id — the same
 *  key event notes use — so no note row needs to exist first. */
export type AttachmentEntityType = 'task' | 'project' | 'event_note' | 'instance_note' | 'note' | 'routine'

export interface Attachment {
  id: string
  fileName: string
  fileType: string
  url: string
}

/** Document types the storage bucket's allowed_mime_types accepts. Images are
 *  handled separately (converted to JPEG so HEIC/WebP pastes always land). */
const DOCUMENT_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'audio/mpeg': 'mp3',
}

/** `accept` attribute for a picker offering everything attachFile can take. */
export const ATTACHMENT_ACCEPT = ['image/*', ...Object.keys(DOCUMENT_MIME_TYPES)].join(',')

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

/** Attachments on an entity (the `attachments` table + bucket), with
 *  short-lived signed URLs for display/download. */
export async function listAttachments(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<Attachment[]> {
  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, file_name, file_type, storage_path')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
  if (error || !rows) return []

  const attachments: Attachment[] = []
  for (const row of rows) {
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(row.storage_path, 3600)
    if (data?.signedUrl) {
      attachments.push({ id: row.id, fileName: row.file_name, fileType: row.file_type, url: data.signedUrl })
    }
  }
  return attachments
}

/**
 * Attach a file to an entity: upload to storage → insert an attachments row.
 * Images are downscaled/re-encoded to JPEG; documents upload as-is when the
 * bucket accepts their MIME type. Returns false (and logs) on anything else.
 */
export async function attachFile(
  entityType: AttachmentEntityType,
  entityId: string,
  file: Blob,
  fileName?: string,
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not signed in')

    let upload: Blob
    let contentType: string
    let extension: string
    if (file.type.startsWith('image/') || file.type === '') {
      upload = await toJpeg(file)
      contentType = 'image/jpeg'
      extension = 'jpg'
    } else if (DOCUMENT_MIME_TYPES[file.type]) {
      upload = file
      contentType = file.type
      extension = DOCUMENT_MIME_TYPES[file.type]
    } else {
      throw new Error(`Unsupported file type: ${file.type}`)
    }

    const storagePath = `${user.id}/attach/${crypto.randomUUID()}.${extension}`

    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, upload, { contentType, upsert: false })
    if (uploadErr) throw new Error(uploadErr.message)

    const { error: insertErr } = await supabase.from('attachments').insert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      file_name: fileName || `attachment.${extension}`,
      file_type: contentType,
      file_size: upload.size,
      storage_path: storagePath,
    })
    if (insertErr) throw new Error(insertErr.message)
    return true
  } catch (err) {
    console.error('attachFile failed:', err)
    return false
  }
}
