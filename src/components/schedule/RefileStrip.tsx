import { useState } from 'react'
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { DomainChooser } from '@/components/domain/DomainChooser'
import type { RefileRow } from '@/lib/today/refile'

export function RefileStrip({ rows, onFile }: { rows: RefileRow[]; onFile: (task: Task, context: DomainId) => void }) {
  // A long list of re-filing rows used to push the whole Inbox off the first
  // screen; show a few and let the rest be asked for.
  const [showAll, setShowAll] = useState(false)
  if (rows.length === 0) return null
  const PREVIEW = 3
  const shown = showAll ? rows : rows.slice(0, PREVIEW)
  const familyPrivate = rows.filter((r) => r.kind === 'family-private')
  const privateShared = rows.filter((r) => r.kind === 'private-shared')
  return (
    <section aria-label="Needs re-filing" className="card p-4 mb-4 space-y-3">
      {familyPrivate.length > 0 && (
        <p className="text-sm text-neutral-700">{familyPrivate.length} {familyPrivate.length === 1 ? 'item is' : 'items are'} marked Family but only you can see {familyPrivate.length === 1 ? 'it' : 'them'}.</p>
      )}
      {privateShared.length > 0 && (
        <p className="text-sm text-neutral-700">{privateShared.length} private {privateShared.length === 1 ? 'item is' : 'items are'} readable by the household.</p>
      )}
      <ul className="space-y-2">
        {shown.map(({ task, kind }) => (
          <li key={task.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-[10rem] flex-1 text-sm break-words text-neutral-800">{task.title}</span>
            {kind === 'family-private'
              ? <DomainChooser size="sm" onChoose={(d) => onFile(task, d)} />
              : <span className="inline-flex gap-1.5">
                  <button type="button" className="px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:bg-neutral-50" onClick={() => onFile(task, task.context as DomainId)}>Keep private</button>
                  <button type="button" className="px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:bg-neutral-50" onClick={() => onFile(task, 'family')}>Move to Family</button>
                </span>}
          </li>
        ))}
      </ul>
      {rows.length > PREVIEW && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm font-medium text-primary-600 hover:text-primary-700">
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  )
}
