import { useState, lazy, Suspense } from 'react'

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

// Editing state must persist across the parent re-renders that happen on every
// keystroke. The parent passes a `key={entityId}` so this component remounts
// when the user switches entities — that handles the "reset on task switch"
// case without trapping focus on each keystroke.
export function PanelWhy({ notes, onChange, label = 'Why', onSaveToVault }: PanelWhyProps) {
  const [editing, setEditing] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  if (!notes && !onChange) return null

  const hasContent = !!(notes || '').replace(/<[^>]*>/g, '').trim()

  const handleSaveToVault = async () => {
    if (!hasContent || !onSaveToVault) return
    setVaultStatus('saving')
    const res = await onSaveToVault(notes || '')
    setVaultStatus(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setVaultStatus('idle'), 4000)
  }

  return (
    <section className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">{label}</div>
        {onSaveToVault && hasContent && (
          <button
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
        )}
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
