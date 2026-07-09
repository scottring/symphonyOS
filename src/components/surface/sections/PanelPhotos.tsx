import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ClipboardPaste, FileText, ImageUp, Loader2, X } from 'lucide-react'
import {
  listAttachments,
  attachFile,
  deleteAttachment,
  ATTACHMENT_ACCEPT,
  type Attachment,
  type AttachmentEntityType,
} from '@/lib/taskAttachments'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'

interface PanelPhotosProps {
  entityType: AttachmentEntityType
  entityId: string
}

/**
 * Photos & files on an entity — the context capture is about (the fixture you
 * photographed, the permission slip PDF, the screenshot with the specs).
 * Ways in: camera (Continuity Camera on a Mac), file picker (images and
 * documents), the Paste tile, and plain ⌘V while the panel is open. Images
 * render as thumbnails; documents as file chips. Hover (or touch) shows a ✕
 * to remove. Everything opens full size in a new tab.
 */
export function PanelPhotos({ entityType, entityId }: PanelPhotosProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  const reload = useCallback(async () => {
    setAttachments(await listAttachments(entityType, entityId))
  }, [entityType, entityId])

  useEffect(() => { void reload() }, [reload])

  const attach = useCallback(async (blob: Blob, fileName?: string) => {
    setBusy(true)
    try {
      if (await attachFile(entityType, entityId, blob, fileName)) await reload()
      else flashNotice("Couldn't attach that file")
    } finally {
      setBusy(false)
    }
  }, [entityType, entityId, reload, flashNotice])

  const remove = useCallback(async (att: Attachment) => {
    setBusy(true)
    try {
      if (await deleteAttachment(att.id)) await reload()
      else flashNotice("Couldn't remove that file")
    } finally {
      setBusy(false)
    }
  }, [reload, flashNotice])

  // The Paste tile — reads the clipboard on click, for people (and iPads)
  // that won't reach for ⌘V. Requires the async Clipboard API.
  const pasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          void attach(blob, `pasted-${Date.now()}.png`)
          return
        }
      }
      flashNotice('No image on the clipboard')
    } catch {
      flashNotice("Couldn't read the clipboard — try ⌘V instead")
    }
  }, [attach, flashNotice])

  // ⌘V an image (e.g. a screenshot) anywhere while this panel is open.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      void attach(file, `pasted-${Date.now()}.png`)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [attach])

  const images = attachments.filter((a) => a.fileType.startsWith('image/'))
  const documents = attachments.filter((a) => !a.fileType.startsWith('image/'))

  // ✕ is hover-revealed on pointer devices, always visible on touch (no hover).
  const removeButtonClass =
    'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full grid place-items-center ' +
    'bg-neutral-700/90 text-white shadow-sm ' +
    'opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 ' +
    'hover:bg-neutral-900 transition-opacity'

  const addTileClass =
    'w-20 h-20 rounded-lg border border-dashed border-neutral-300 text-neutral-400 ' +
    'hover:text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 ' +
    'grid place-items-center transition-colors disabled:opacity-60'

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Photos &amp; files</div>

      <div className="flex flex-wrap gap-2">
        {images.map((img) => (
          <div key={img.id} className="relative group">
            <a
              href={img.url}
              target="_blank"
              rel="noopener noreferrer"
              title={img.fileName}
              className="block w-20 h-20 rounded-lg overflow-hidden bg-neutral-100 shadow-[inset_0_0_0_1px_#e5e7eb] hover:opacity-90"
            >
              <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" loading="lazy" />
            </a>
            <button
              type="button"
              aria-label={`Remove ${img.fileName}`}
              disabled={busy}
              onClick={() => void remove(img)}
              className={removeButtonClass}
            >
              <X className="w-3 h-3" aria-hidden />
            </button>
          </div>
        ))}

        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void attach(f, f.name)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={busy}
          title="Snap a photo"
          className={addTileClass}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          title="Choose an image or document"
          className={addTileClass}
        >
          <ImageUp className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => void pasteFromClipboard()}
          disabled={busy}
          title="Paste an image from the clipboard"
          aria-label="Paste from clipboard"
          className={addTileClass}
        >
          <ClipboardPaste className="w-5 h-5" />
        </button>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {documents.map((doc) => (
            <div key={doc.id} className="relative group max-w-full">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                title={doc.fileName}
                className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-lg bg-white shadow-[inset_0_0_0_1px_#e5e7eb] text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <FileText className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden />
                <span className="truncate">{doc.fileName}</span>
              </a>
              <button
                type="button"
                aria-label={`Remove ${doc.fileName}`}
                disabled={busy}
                onClick={() => void remove(doc)}
                className={removeButtonClass}
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-neutral-400 mt-1.5" aria-live="polite">
        {notice ?? 'Snap, choose a file (PDF and docs welcome), or paste a screenshot'}
      </p>

      {showCamera && (
        <CameraCaptureModal
          onCapture={(blob) => { setShowCamera(false); void attach(blob, 'camera.jpg') }}
          onPickFile={() => { setShowCamera(false); fileInputRef.current?.click() }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </section>
  )
}
