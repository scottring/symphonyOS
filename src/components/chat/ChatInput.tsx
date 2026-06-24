import { useState, useCallback, useRef, useEffect } from 'react'
import { Paperclip, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ALLOWED_FILE_TYPES, isAllowedFileType } from '@/types/attachment'
import { uploadChatFile, type ChatAttachment } from './ChatAttachment'

interface ChatInputProps {
  onSend: (message: string, attachment?: ChatAttachment) => void
  loading?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, loading = false, placeholder = 'Ask about this...' }: ChatInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ChatAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { user } = useAuth()

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [value])

  const attach = useCallback(async (file: File) => {
    if (!user || !isAllowedFileType(file.type)) return
    setUploadError(null)
    setUploading(true)
    try {
      setPending(await uploadChatFile(file, user.id))
    } catch {
      setUploadError('Could not attach file. Try again.')
    } finally {
      setUploading(false)
    }
  }, [user])

  const handleSubmit = useCallback(() => {
    if ((!value.trim() && !pending) || loading || uploading) return
    onSend(value.trim(), pending ?? undefined)
    setValue('')
    setPending(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [value, pending, loading, uploading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // Paste a screenshot (or any image) straight from the clipboard.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            // Clipboard images often arrive unnamed; give them a real filename.
            const named = file.name
              ? file
              : new File([file], `screenshot-${Date.now()}.png`, { type: file.type || 'image/png' })
            attach(named)
          }
          return
        }
      }
    },
    [attach]
  )

  return (
    <div
      className="flex flex-col gap-1.5 p-3 border-t border-neutral-200 bg-white"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) attach(f) }}
    >
      {/* Upload error */}
      {uploadError && (
        <div className="text-xs text-red-600 px-2 py-1">{uploadError}</div>
      )}

      {/* Attachment preview chip */}
      {pending && (
        <div className="flex items-center gap-2 text-xs text-neutral-600 px-2 py-1 bg-neutral-100 rounded-md">
          {pending.fileType.startsWith('image/') && (
            <img
              src={pending.url}
              alt={pending.fileName}
              className="w-10 h-10 rounded object-cover flex-none border border-neutral-200"
            />
          )}
          <span className="truncate flex-1">{pending.fileName}</span>
          <button onClick={() => { setPending(null); setUploadError(null) }} aria-label="Remove attachment">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 px-2 py-1">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Uploading…</span>
        </div>
      )}

      {/* Composer row */}
      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_FILE_TYPES.join(',')}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f) }}
        />

        {/* Paperclip button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading || uploading}
          className="flex-none w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={loading || uploading}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
            disabled:opacity-50 placeholder:text-neutral-400"
        />
        <button
          onClick={handleSubmit}
          disabled={(!value.trim() && !pending) || loading || uploading}
          className="flex-none w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center
            hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
