import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { DomainChooser } from '@/components/domain/DomainChooser'
import type { RefileRow } from '@/lib/today/refile'

export function RefileStrip({ rows, onFile }: { rows: RefileRow[]; onFile: (task: Task, context: DomainId) => void }) {
  if (rows.length === 0) return null
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
        {rows.map(({ task, kind }) => (
          <li key={task.id} className="flex items-center justify-between gap-3">
            <span className="text-sm truncate">{task.title}</span>
            {kind === 'family-private'
              ? <DomainChooser size="sm" onChoose={(d) => onFile(task, d)} />
              : <span className="inline-flex gap-1.5">
                  <button type="button" className="px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:bg-neutral-50" onClick={() => onFile(task, task.context as DomainId)}>Keep private</button>
                  <button type="button" className="px-2.5 py-1 text-xs rounded-full border border-neutral-200 bg-white hover:bg-neutral-50" onClick={() => onFile(task, 'family')}>Move to Family</button>
                </span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
