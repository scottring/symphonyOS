import { useState } from 'react'
import { Mail } from 'lucide-react'
import { useCapture } from '@/hooks/useCapture'
import { PanelSection } from './PanelSection'

interface PanelSourceProps {
  captureId: string | undefined
}

function receivedOn(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Where this task came from — the forwarded email behind an extracted row.
 *
 * Quiet by design: one line of who and what, the date, and the original folded
 * away. The quote already sits in the task's notes, so this doesn't repeat it;
 * it exists for the moment you don't trust the extraction and want to read the
 * email yourself.
 */
export function PanelSource({ captureId }: PanelSourceProps) {
  const { capture, error } = useCapture(captureId)
  const [open, setOpen] = useState(false)

  // A failed read used to be indistinguishable from a task with no source at
  // all — both drew nothing. One quiet line, because the reason someone opens
  // this section is that they do not trust the extraction, and silence there
  // is the worst possible answer.
  if (!capture) {
    if (!error) return null
    return (
      <PanelSection id="source" label="Source">
        <p className="text-sm text-neutral-500">Couldn’t load the source email.</p>
      </PanelSection>
    )
  }

  const headline = [capture.sender, capture.subject].filter(Boolean).join(' · ')
  const received = receivedOn(capture.createdAt)

  return (
    <PanelSection
      id="source"
      label="Source"
      preview={capture.subject || capture.sender || capture.sourceLabel || undefined}
    >
      <div className="flex items-start gap-2 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb]">
        <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md bg-neutral-100">
          <Mail className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-neutral-800 break-words">
            {headline || capture.sourceLabel || 'Forwarded email'}
          </span>
          {received && <span className="block text-xs text-neutral-500">{received}</span>}
        </span>
      </div>

      {capture.rawText && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
          >
            {open ? 'Hide original' : 'Open original'}
          </button>
          {open && (
            // Plain text only. A school email is untrusted HTML; it gets read,
            // never rendered.
            <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-md bg-neutral-50 p-2 text-[13px] leading-relaxed text-neutral-700 whitespace-pre-wrap break-words">
              {capture.rawText}
            </div>
          )}
        </>
      )}
    </PanelSection>
  )
}
