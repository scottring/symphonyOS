import { useEffect, useState, lazy, Suspense } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import { PanelSection } from './PanelSection'
import { notesToHtml } from '@/lib/notes/notesToHtml'

const TiptapEditor = lazy(() =>
  import('@/components/notes/TiptapEditor').then((m) => ({ default: m.TiptapEditor })),
)

/** The right panel is 380px; the wide overlay doubles it, clamped to the viewport. */
const PANEL_W = 380

export interface PanelNotesProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default heading (event: "What to bring", step: "Instructions"). */
  label?: string
  /** Collapse key. Defaults to 'notes', so every panel's Notes shares one preference. */
  id?: string
  /**
   * When provided, shows a "Save to vault" action that promotes these notes into
   * a persisting markdown note linked to this entity.
   */
  onSaveToVault?: (content: string) => Promise<{ ok: boolean; url?: string }>
}

/** One line of plain text standing in for the note while the section is collapsed. */
export function notesPreview(html: string | undefined): string | undefined {
  const text = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/**
 * Notes, with exactly two reversible controls.
 *
 * Its predecessor ran two state machines at once: `editing`, entered by clicking
 * the note and impossible to leave, and `expand`, a four-step cycle you had to
 * ride all the way around to get small again. Both are gone. The editor is
 * always live, so there is no mode to be trapped in, and width is one boolean
 * that Escape also clears.
 *
 * Because the editor lives inside PanelSection's body, collapsing the section
 * unmounts it — a collapsed Notes never pulls the Tiptap chunk at all.
 */
export function PanelNotes({
  notes,
  onChange,
  label = 'Notes',
  id = 'notes',
  onSaveToVault,
}: PanelNotesProps) {
  const [wide, setWide] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!wide) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault() // consumed: the panel around it stays open (useEscapeKey)
      setWide(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wide])

  if (!notes && !onChange) return null

  const hasContent = !!(notes || '').replace(/<[^>]*>/g, '').trim()

  const handleSaveToVault = async () => {
    if (!hasContent || !onSaveToVault) return
    setVaultStatus('saving')
    const res = await onSaveToVault(notes || '')
    setVaultStatus(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setVaultStatus('idle'), 4000)
  }

  const saveButton = onSaveToVault && hasContent && (
    <button
      type="button"
      onClick={handleSaveToVault}
      disabled={vaultStatus === 'saving'}
      className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-primary-600 disabled:opacity-40 transition-colors"
      title="Save these notes as a permanent note in your vault, linked to this task"
    >
      {vaultStatus === 'saved'
        ? 'Saved to vault'
        : vaultStatus === 'saving'
          ? 'Saving…'
          : vaultStatus === 'error'
            ? 'Retry save'
            : 'Save to vault'}
    </button>
  )

  const widenButton = onChange && (
    <button
      type="button"
      onClick={() => setWide((w) => !w)}
      aria-label={wide ? `Narrow ${label}` : `Widen ${label}`}
      title={wide ? 'Back into the panel' : 'Give the note room'}
      className="text-neutral-400 hover:text-primary-600 transition-colors"
    >
      {wide ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>
  )

  const editor = onChange ? (
    <Suspense fallback={null}>
      <TiptapEditor content={notes ?? ''} onChange={onChange} placeholder="Add notes…" />
    </Suspense>
  ) : (
    <>
      <div
        className="panel-notes-read text-sm text-neutral-600 border-l-2 border-neutral-300 pl-3 py-1"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notesToHtml(notes)) }}
      />
      {/* The editor carries its own spacing; the read-only branch has to say it
          again or an agent's headings and bullets run together here. */}
      <style>{`
        .panel-notes-read p { margin: 0.45rem 0; }
        .panel-notes-read p:first-child { margin-top: 0; }
        .panel-notes-read h1,
        .panel-notes-read h2,
        .panel-notes-read h3 {
          font-weight: 600;
          margin: 0.75rem 0 0.25rem;
          color: #404040;
        }
        .panel-notes-read h1 { font-size: 1.125rem; }
        .panel-notes-read h2 { font-size: 1rem; }
        .panel-notes-read h3 { font-size: 0.9375rem; }
        .panel-notes-read :is(h1, h2, h3):first-child { margin-top: 0; }
        .panel-notes-read ul { list-style: disc; padding-left: 1.25rem; margin: 0.4rem 0; }
        .panel-notes-read ol { list-style: decimal; padding-left: 1.25rem; margin: 0.4rem 0; }
        .panel-notes-read ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .panel-notes-read li { margin: 0.15rem 0; }
        .panel-notes-read li p { margin: 0; }
        .panel-notes-read blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 0.75rem;
          color: #6b7280;
          margin: 0.5rem 0;
        }
        .panel-notes-read code {
          font-family: ui-monospace, monospace;
          font-size: 0.9em;
          background: #f3f4f6;
          padding: 0.1em 0.3em;
          border-radius: 4px;
        }
        .panel-notes-read hr { border: 0; border-top: 1px solid #e5e7eb; margin: 0.75rem 0; }
      `}</style>
    </>
  )

  return (
    <>
      <PanelSection
        id={id}
        label={label}
        preview={notesPreview(notes)}
        // While the overlay is open it owns both controls — leaving a second
        // pair in the inline header gave the panel two "Narrow" buttons. And a
        // collapsed section has nothing to widen or save.
        actions={(collapsed) =>
          wide || collapsed ? undefined : (
            <>
              {saveButton}
              {widenButton}
            </>
          )
        }
      >
        {wide ? (
          <div className="text-sm italic text-neutral-400 border-l-2 border-neutral-300 pl-3 py-1">
            Editing — widened
          </div>
        ) : (
          <div className="rounded-md border border-neutral-200 bg-white p-2">{editor}</div>
        )}
      </PanelSection>

      {wide && (
        <>
          {/* Click-catcher, declared before the overlay so it sits behind it. */}
          <div className="fixed inset-0 z-40" onClick={() => setWide(false)} aria-hidden />
          <div
            data-testid="notes-overlay"
            className="fixed top-0 bottom-0 right-0 z-40 bg-bg-elevated border-l border-neutral-200/80 shadow-2xl flex flex-col"
            style={{
              width: Math.min(
                PANEL_W * 2,
                typeof window !== 'undefined' ? window.innerWidth - 40 : PANEL_W * 2,
              ),
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/70">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
                {label}
              </div>
              <div className="flex items-center gap-3">
                {saveButton}
                {widenButton}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">{editor}</div>
          </div>
        </>
      )}
    </>
  )
}
