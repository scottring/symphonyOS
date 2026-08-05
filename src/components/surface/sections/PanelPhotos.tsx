import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ClipboardPaste, FileText, ImageUp, Loader2, X } from 'lucide-react'
import {
  listAttachments,
  attachFile,
  deleteAttachment,
  analyzeAttachment,
  ATTACHMENT_ACCEPT,
  type Attachment,
  type AttachmentEntityType,
} from '@/lib/taskAttachments'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'
import { AttachmentFacets, type FacetPromotions } from './AttachmentFacets'
import { DocumentProposalRow } from './DocumentProposal'
import { setDocumentStatus } from '@/lib/taskAttachments'
import { PanelSection } from './PanelSection'

interface PanelPhotosProps {
  entityType: AttachmentEntityType
  entityId: string
  /** Short "attached to X" string that steers facet extraction. */
  entityContext?: string
  /** Handlers for promoting extracted facets into the entity's fields. */
  promotions?: FacetPromotions
  /**
   * Element that should accept file drops — normally the whole detail panel.
   *
   * Measured on the live panel 2026-08-03: the Photos & files section is 200px
   * of a 1237px panel, so only 16% of it accepted a drop. Everywhere else no
   * handler called preventDefault, and the browser's default for a dropped
   * file is to NAVIGATE THE TAB TO IT — you don't get an error, you get thrown
   * out of Symphony. Widening the target to the panel is the fix; the section
   * still highlights so it stays obvious where the file lands.
   *
   * Omitted → falls back to this section alone (its own drop target).
   */
  dropZoneRef?: React.RefObject<HTMLElement | null>
  /** When true and there are no attachments, render nothing. The component
   *  stays mounted (returning null still runs hooks), so the panel-wide drop
   *  listeners bound in the effect below keep working. */
  hideWhenEmpty?: boolean
  /** Reports whether this entity has any attachments, so the panel's Add row
   *  knows whether to offer "Photo". */
  onContentChange?: (hasContent: boolean) => void
}

/**
 * Photos & files on an entity — the context capture is about (the fixture you
 * photographed, the permission slip PDF, the screenshot with the specs).
 * Ways in: camera (Continuity Camera on a Mac), file picker (images and
 * documents), the Paste tile, and plain ⌘V while the panel is open. Images
 * render as thumbnails; documents as file chips. Hover (or touch) shows a ✕
 * to remove. Everything opens full size in a new tab.
 */
export function PanelPhotos({ entityType, entityId, entityContext, promotions, dropZoneRef, hideWhenEmpty, onContentChange }: PanelPhotosProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
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

  // Report emptiness up so the panel's Add row can offer "Photo".
  useEffect(() => { onContentChange?.(attachments.length > 0) }, [attachments.length, onContentChange])

  const attach = useCallback(async (blob: Blob, fileName?: string) => {
    setBusy(true)
    try {
      const result = await attachFile(entityType, entityId, blob, fileName)
      if (!result) { flashNotice("Couldn't attach that file"); return }
      await reload()
      // Facet extraction (images + PDFs). Fire-and-forget: the attachment
      // stands on its own; a panel closed mid-analysis just finds the stored
      // facets on next open.
      if (result.contentType.startsWith('image/') || result.contentType === 'application/pdf') {
        setAnalyzingIds((prev) => new Set(prev).add(result.id))
        void analyzeAttachment(result.id, entityContext).then(async () => {
          await reload()
          setAnalyzingIds((prev) => { const next = new Set(prev); next.delete(result.id); return next })
        })
      }
    } finally {
      setBusy(false)
    }
  }, [entityType, entityId, entityContext, reload, flashNotice])

  const answerProposal = useCallback(async (id: string, status: 'kept' | 'dismissed') => {
    if (await setDocumentStatus(id, status)) await reload()
    else flashNotice("Couldn't update that document")
  }, [reload, flashNotice])

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
  // that won't reach for ⌘V. Requires the async Clipboard API. A copied FILE
  // (Finder / the screenshot thumbnail) is only a reference on the clipboard —
  // the async API surfaces it as an item with no web-readable types and can't
  // deliver its contents; only a real ⌘V keystroke or a drag-drop can.
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
      if (items.some((item) => item.types.length === 0)) {
        flashNotice('That looks like a copied file — press ⌘V here, or drag it in')
      } else {
        flashNotice('No image on the clipboard')
      }
    } catch {
      flashNotice("Couldn't read the clipboard — try ⌘V instead")
    }
  }, [attach, flashNotice])

  // ⌘V anywhere while this panel is open. Unlike the async API, the paste
  // event carries real file contents — a screenshot's pixels AND copied files
  // (the screenshot thumbnail, a PDF from Finder) both arrive here.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? [])
      const image = items.find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (image) {
        e.preventDefault()
        void attach(image, image.name || `pasted-${Date.now()}.png`)
        return
      }
      const file = items.find((i) => i.kind === 'file')?.getAsFile()
        ?? e.clipboardData?.files?.[0]
        ?? null
      if (!file) return
      e.preventDefault()
      void attach(file, file.name || undefined)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [attach])

  // Drag & drop — the other route that carries real file contents. Dropping
  // the macOS screenshot thumbnail (or any file) attaches it.
  //
  // Bound natively to the whole panel (see `dropZoneRef`) rather than as React
  // handlers on the section, because the section alone was a 16% target and a
  // miss navigates the tab to the file. One listener on the outer element also
  // means a drop on the section still lands exactly once, by bubbling.
  const [dragOver, setDragOver] = useState(false)
  // The drop zone is now a plain wrapper div around PanelSection, so the
  // section itself can stay a pure PanelSection with no ref or className.
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const zone = dropZoneRef?.current ?? sectionRef.current
    if (!zone) return

    // Only intercept file drags. Internal item drags (dnd-kit, the planning
    // grids, the routines canvas) must pass through untouched.
    const isFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault() // this is what makes the drop legal
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
    const onDragLeave = (e: DragEvent) => {
      // dragleave also fires when crossing into a child; ignore those.
      if (e.relatedTarget instanceof Node && zone.contains(e.relatedTarget)) return
      setDragOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      setDragOver(false)
      for (const file of Array.from(e.dataTransfer?.files ?? [])) {
        void attach(file, file.name || undefined)
      }
    }

    zone.addEventListener('dragover', onDragOver)
    zone.addEventListener('dragleave', onDragLeave)
    zone.addEventListener('drop', onDrop)
    return () => {
      zone.removeEventListener('dragover', onDragOver)
      zone.removeEventListener('dragleave', onDragLeave)
      zone.removeEventListener('drop', onDrop)
    }
  }, [attach, dropZoneRef])

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

  // Three empty dropzones under a header, on every task, forever, was the
  // single largest block of the panel asking for something instead of showing
  // something. Returning null here keeps every hook above running — including
  // the panel-wide drag/drop and paste listeners — so files still attach by
  // drop or ⌘V even when the section is invisible.
  if (hideWhenEmpty && attachments.length === 0) return null

  return (
    <div
      ref={sectionRef}
      className={dragOver ? 'rounded-lg outline-2 outline-dashed outline-primary-400 outline-offset-4' : undefined}
    >
      <PanelSection
        id="photos"
        label="Photos &amp; files"
        preview={attachments.length ? `${attachments.length} file${attachments.length === 1 ? '' : 's'}` : undefined}
      >

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

      {/* The morphing artifact: extracted facets per attachment, plus a quiet
          in-flight line while the vision pass runs. */}
      {attachments.map((att) => (
        <div key={`facets-${att.id}`}>
          {analyzingIds.has(att.id) && !att.analyzedAt && (
            <p className="text-[11px] text-neutral-400 mt-1.5 animate-pulse">Reading {att.fileName}…</p>
          )}
          {att.documentStatus === 'proposed' && att.documentKind && (
            <DocumentProposalRow
              kind={att.documentKind}
              label={att.documentLabel ?? att.fileName}
              onKeep={() => void answerProposal(att.id, 'kept')}
              onDismiss={() => void answerProposal(att.id, 'dismissed')}
            />
          )}
          <AttachmentFacets facets={att.facets} promotions={promotions} />
        </div>
      ))}

      <p className="text-[11px] text-neutral-400 mt-1.5" aria-live="polite">
        {notice ?? 'Snap, choose a file (PDF and docs welcome), paste (⌘V), or drag one in'}
      </p>

      {showCamera && (
        <CameraCaptureModal
          onCapture={(blob) => { setShowCamera(false); void attach(blob, 'camera.jpg') }}
          onPickFile={() => { setShowCamera(false); fileInputRef.current?.click() }}
          onClose={() => setShowCamera(false)}
        />
      )}
      </PanelSection>
    </div>
  )
}
