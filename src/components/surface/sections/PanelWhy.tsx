import { useState, lazy, Suspense } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

const TiptapEditor = lazy(() =>
  import('@/components/notes/TiptapEditor').then(m => ({ default: m.TiptapEditor }))
)

interface PanelWhyProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default "Why" label. Used by Plan 2 for events ("What to bring"). */
  label?: string
  /**
   * When provided, shows a "Save to vault" action that promotes these notes into a
   * persisting markdown note in the vault, linked to this entity.
   */
  onSaveToVault?: (content: string) => Promise<{ ok: boolean; url?: string }>
}

// The right side panel is 380px. Expand steps grow the editor leftward over the
// main view: tall (panel width, full height) → 2× wide → 3× wide → back to inline.
const PANEL_W = 380
const EXPAND = [
  { label: '', width: PANEL_W },        // 0 = inline (no overlay)
  { label: 'Tall', width: PANEL_W },    // 1 = full height, panel width
  { label: '2×', width: PANEL_W * 2 },  // 2 = double width
  { label: '3×', width: PANEL_W * 3 },  // 3 = triple width
] as const

// Editing state must persist across the parent re-renders that happen on every
// keystroke. The parent passes a `key={entityId}` so this component remounts
// when the user switches entities — that handles the "reset on task switch"
// case without trapping focus on each keystroke.
export function PanelWhy({ notes, onChange, label = 'Why', onSaveToVault }: PanelWhyProps) {
  const [editing, setEditing] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [expand, setExpand] = useState(0) // 0 inline, 1 tall, 2 ×2, 3 ×3

  if (!notes && !onChange) return null

  const hasContent = !!(notes || '').replace(/<[^>]*>/g, '').trim()

  const handleSaveToVault = async () => {
    if (!hasContent || !onSaveToVault) return
    setVaultStatus('saving')
    const res = await onSaveToVault(notes || '')
    setVaultStatus(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setVaultStatus('idle'), 4000)
  }

  // One button cycles: normal → tall → 2× → 3× → normal.
  const cycleExpand = () => setExpand((e) => (e + 1) % 4)
  const expandTitle =
    expand === 0 ? 'Give the note room (tall)'
    : expand === 1 ? 'Wider (2×)'
    : expand === 2 ? 'Wider (3×)'
    : 'Collapse'

  const saveButton = onSaveToVault && hasContent && (
    <button
      onClick={handleSaveToVault}
      disabled={vaultStatus === 'saving'}
      className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-primary-600 disabled:opacity-40 transition-colors"
      title="Save these notes as a permanent note in your vault, linked to this task"
    >
      {vaultStatus === 'saved' ? 'Saved to vault'
        : vaultStatus === 'saving' ? 'Saving…'
        : vaultStatus === 'error' ? 'Retry save'
        : 'Save to vault'}
    </button>
  )

  const expandButton = onChange && (
    <button
      onClick={cycleExpand}
      className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400 hover:text-primary-600 transition-colors"
      title={expandTitle}
    >
      {EXPAND[expand].label && <span>{EXPAND[expand].label}</span>}
      {expand === 0 ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
    </button>
  )

  // ── Expanded: a right-anchored editor that grows leftward over the view ──
  if (expand > 0 && onChange) {
    const width = Math.min(
      EXPAND[expand].width,
      typeof window !== 'undefined' ? window.innerWidth - 40 : EXPAND[expand].width,
    )
    return (
      <>
        {/* Keep an inline placeholder so the section's spot in the panel is stable. */}
        <section>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1">{label}</div>
          <div className="text-sm italic text-neutral-400 border-l-2 border-neutral-300 pl-3 py-1">Editing — expanded ↗</div>
        </section>

        <div
          className="fixed top-0 bottom-0 right-0 z-40 bg-bg-elevated border-l border-neutral-200/80 shadow-2xl flex flex-col"
          style={{ width }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/70">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">{label}</div>
            <div className="flex items-center gap-3">
              {saveButton}
              {expandButton}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            <Suspense fallback={null}>
              <TiptapEditor content={notes ?? ''} onChange={onChange} placeholder="Add notes…" autoFocus />
            </Suspense>
          </div>
        </div>
      </>
    )
  }

  // ── Inline (default) ──
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">{label}</div>
        <div className="flex items-center gap-3">
          {saveButton}
          {expandButton}
        </div>
      </div>
      {editing && onChange ? (
        <div className="rounded-md border border-primary-200 bg-white p-2">
          <Suspense fallback={null}>
            <TiptapEditor
              content={notes ?? ''}
              onChange={onChange}
              placeholder="Add notes…"
              autoFocus
            />
          </Suspense>
        </div>
      ) : (
        <button
          onClick={() => onChange && setEditing(true)}
          disabled={!onChange}
          className="w-full text-left text-sm italic text-neutral-600 border-l-2 border-neutral-300 pl-3 py-1 hover:text-neutral-900"
        >
          {notes
            ? <div dangerouslySetInnerHTML={{ __html: notes }} className="prose-sm" />
            : <span className="not-italic text-neutral-400">Add notes…</span>}
        </button>
      )}
    </section>
  )
}
