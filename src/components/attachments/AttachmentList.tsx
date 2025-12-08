import { useState, useCallback } from 'react'
import { type Attachment, formatFileSize, getFileIconType } from '@/types/attachment'

interface AttachmentListProps {
  attachments: Attachment[]
  onDelete: (attachment: Attachment) => void
  onOpen: (attachment: Attachment) => void
  isDeleting?: boolean
}

function FileIcon({ type }: { type: 'image' | 'document' | 'spreadsheet' | 'audio' | 'file' }) {
  switch (type) {
    case 'image':
      return (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
            clipRule="evenodd"
          />
        </svg>
      )
    case 'document':
      return (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
            clipRule="evenodd"
          />
        </svg>
      )
    case 'spreadsheet':
      return (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z"
            clipRule="evenodd"
          />
        </svg>
      )
    case 'audio':
      return (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
        </svg>
      )
    default:
      return (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
            clipRule="evenodd"
          />
        </svg>
      )
  }
}

export function AttachmentList({ attachments, onDelete, onOpen, isDeleting = false }: AttachmentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (attachment: Attachment, e: React.MouseEvent) => {
      e.stopPropagation()
      setDeletingId(attachment.id)
      await onDelete(attachment)
      setDeletingId(null)
    },
    [onDelete]
  )

  if (attachments.length === 0) {
    return null
  }

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => {
        const iconType = getFileIconType(attachment.fileType)
        const isCurrentlyDeleting = deletingId === attachment.id || isDeleting

        return (
          <li
            key={attachment.id}
            onClick={() => onOpen(attachment)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl bg-neutral-50
              active:bg-neutral-100 transition-colors cursor-pointer
              ${isCurrentlyDeleting ? 'opacity-50' : ''}
            `}
          >
            {/* Icon */}
            <div
              className={`
                w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                ${iconType === 'image'
                  ? 'bg-purple-100 text-purple-600'
                  : iconType === 'audio'
                  ? 'bg-amber-100 text-amber-600'
                  : iconType === 'spreadsheet'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-blue-100 text-blue-600'
                }
              `}
            >
              <FileIcon type={iconType} />
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">
                {attachment.fileName}
              </p>
              <p className="text-xs text-neutral-500">
                {formatFileSize(attachment.fileSize)}
              </p>
            </div>

            {/* Delete button */}
            <button
              onClick={(e) => handleDelete(attachment, e)}
              disabled={isCurrentlyDeleting}
              className="p-2 text-neutral-400 hover:text-red-500 active:text-red-600
                         transition-colors disabled:opacity-50"
              aria-label={`Delete ${attachment.fileName}`}
            >
              {deletingId === attachment.id ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
