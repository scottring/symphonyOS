import { useState, lazy, Suspense } from 'react'

const TiptapEditor = lazy(() =>
  import('@/components/notes/TiptapEditor').then(m => ({ default: m.TiptapEditor }))
)

interface PanelWhyProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default "Why" label. Used by Plan 2 for events ("What to bring"). */
  label?: string
}

// Editing state must persist across the parent re-renders that happen on every
// keystroke. The parent passes a `key={entityId}` so this component remounts
// when the user switches entities — that handles the "reset on task switch"
// case without trapping focus on each keystroke.
export function PanelWhy({ notes, onChange, label = 'Why' }: PanelWhyProps) {
  const [editing, setEditing] = useState(false)

  if (!notes && !onChange) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1">{label}</div>
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
