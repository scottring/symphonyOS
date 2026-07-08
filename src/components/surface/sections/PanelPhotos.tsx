import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImageUp, Loader2 } from 'lucide-react'
import { listTaskImages, attachImageToTask, type TaskImage } from '@/lib/taskAttachments'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'

interface PanelPhotosProps {
  taskId: string
}

/**
 * Photos on a task — the context that photo-first capture is about (the
 * fixture you photographed, the screenshot with the specs). Three ways in:
 * camera (Continuity Camera on a Mac), file picker, and plain ⌘V paste while
 * the panel is open. Thumbnails open full size in a new tab.
 */
export function PanelPhotos({ taskId }: PanelPhotosProps) {
  const [images, setImages] = useState<TaskImage[]>([])
  const [busy, setBusy] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setImages(await listTaskImages(taskId))
  }, [taskId])

  useEffect(() => { void reload() }, [reload])

  const attach = useCallback(async (blob: Blob, fileName?: string) => {
    setBusy(true)
    try {
      if (await attachImageToTask(taskId, blob, fileName)) await reload()
    } finally {
      setBusy(false)
    }
  }, [taskId, reload])

  // ⌘V an image (e.g. a screenshot) anywhere while this task's panel is open.
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

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Photos</div>

      <div className="flex flex-wrap gap-2">
        {images.map((img) => (
          <a
            key={img.id}
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            title={img.fileName}
            className="block w-20 h-20 rounded-lg overflow-hidden bg-neutral-100 shadow-[inset_0_0_0_1px_#e5e7eb] hover:opacity-90"
          >
            <img src={img.url} alt={img.fileName} className="w-full h-full object-cover" loading="lazy" />
          </a>
        ))}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
          title="Snap a photo (or paste a screenshot with ⌘V)"
          className="w-20 h-20 rounded-lg border border-dashed border-neutral-300 text-neutral-400 hover:text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 grid place-items-center transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          title="Choose an image file"
          className="w-20 h-20 rounded-lg border border-dashed border-neutral-300 text-neutral-400 hover:text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 grid place-items-center transition-colors disabled:opacity-60"
        >
          <ImageUp className="w-5 h-5" />
        </button>
      </div>

      <p className="text-[11px] text-neutral-400 mt-1.5">Snap, choose a file, or paste a screenshot (⌘V)</p>

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
