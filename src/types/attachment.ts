// Entity types that can have attachments
export type AttachmentEntityType = 'task' | 'project' | 'event_note' | 'instance_note' | 'note'

// ============================================================================
// Attachment
// ============================================================================
export interface Attachment {
  id: string
  entityType: AttachmentEntityType
  entityId: string
  fileName: string
  fileType: string // MIME type
  fileSize: number // bytes
  storagePath: string
  createdAt: Date
}

export interface DbAttachment {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  created_at: string
}

// ============================================================================
// Allowed file types
// ============================================================================
export const ALLOWED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/csv',
  'text/plain',
  'audio/mpeg',
] as const

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number]

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB in bytes

// ============================================================================
// File type display helpers
// ============================================================================
export const fileTypeLabels: Record<string, string> = {
  'image/png': 'PNG Image',
  'image/jpeg': 'JPEG Image',
  'image/svg+xml': 'SVG Image',
  'application/pdf': 'PDF Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  'text/csv': 'CSV File',
  'text/plain': 'Text File',
  'audio/mpeg': 'Audio File',
}

export const fileTypeIcons: Record<string, string> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/svg+xml': 'image',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'text/csv': 'spreadsheet',
  'text/plain': 'document',
  'audio/mpeg': 'audio',
}

// ============================================================================
// Utility functions
// ============================================================================
export function isAllowedFileType(mimeType: string): mimeType is AllowedFileType {
  return ALLOWED_FILE_TYPES.includes(mimeType as AllowedFileType)
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : ''
}

export function getFileIconType(mimeType: string): 'image' | 'document' | 'spreadsheet' | 'audio' | 'file' {
  return (fileTypeIcons[mimeType] as 'image' | 'document' | 'spreadsheet' | 'audio') || 'file'
}

export function dbAttachmentToAttachment(db: DbAttachment): Attachment {
  return {
    id: db.id,
    entityType: db.entity_type as AttachmentEntityType,
    entityId: db.entity_id,
    fileName: db.file_name,
    fileType: db.file_type,
    fileSize: db.file_size,
    storagePath: db.storage_path,
    createdAt: new Date(db.created_at),
  }
}

/**
 * Generate storage path for an attachment
 * Convention: attachments/{user_id}/{entity_type}/{entity_id}/{filename}
 */
export function generateStoragePath(
  userId: string,
  entityType: AttachmentEntityType,
  entityId: string,
  fileName: string
): string {
  // Sanitize filename - remove special chars, keep extension
  const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  // Add timestamp to avoid collisions
  const timestamp = Date.now()
  const ext = getFileExtension(sanitized)
  const baseName = sanitized.replace(`.${ext}`, '')
  const uniqueName = ext ? `${baseName}_${timestamp}.${ext}` : `${baseName}_${timestamp}`

  return `${userId}/${entityType}/${entityId}/${uniqueName}`
}
