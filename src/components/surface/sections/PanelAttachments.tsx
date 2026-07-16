// Photos & Files on a tap panel — self-contained attachments section for any
// entity that supports them (routines and their steps today). Drop the PT
// sheet or an exercise photo right where you're looking at the routine;
// images and PDFs open in a new tab via signed URLs.
import { useEffect, useState, useCallback } from 'react'
import { useAttachments } from '@/hooks/useAttachments'
import { FileUpload, AttachmentList } from '@/components/attachments'
import type { Attachment, AttachmentEntityType } from '@/types/attachment'

export function PanelAttachments({ entityType, entityId }: {
  entityType: AttachmentEntityType
  entityId: string
}) {
  const { getAttachments, fetchAttachments, uploadAttachment, deleteAttachment, getSignedUrl } = useAttachments()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAttachments(entityType, entityId)
  }, [entityType, entityId, fetchAttachments])

  const files = getAttachments(entityType, entityId)

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true); setError(null)
    const result = await uploadAttachment(entityType, entityId, file)
    if (!result) setError('Upload failed — try again.')
    setUploading(false)
  }, [entityType, entityId, uploadAttachment])

  const handleOpen = useCallback(async (attachment: Attachment) => {
    const url = await getSignedUrl(attachment.storagePath)
    if (url) window.open(url, '_blank', 'noopener')
  }, [getSignedUrl])

  return (
    <section className="pb-4 mb-4 border-b border-neutral-200">
      <h3 className="text-xs font-bold tracking-wider uppercase text-neutral-400 mb-2">
        Photos &amp; Files {files.length > 0 && `(${files.length})`}
      </h3>
      {files.length > 0 && (
        <div className="mb-2">
          <AttachmentList
            attachments={files}
            onDelete={(a) => void deleteAttachment(a)}
            onOpen={(a) => void handleOpen(a)}
          />
        </div>
      )}
      <FileUpload
        onFileSelect={(f) => void handleUpload(f)}
        isUploading={uploading}
        error={error}
        compact={files.length > 0}
      />
    </section>
  )
}
