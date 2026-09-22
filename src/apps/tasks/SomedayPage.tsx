// /someday — the shelf, with a door.
//
// A task sent to Someday leaves every list and every count on purpose. The
// route then redirected to Today (the 2026-08 de-nav), so the only ways back
// were search and the assistant: a one-way door (walkthrough, 2026-09-20).
// This page is the way back. It lists what was set aside, and offers the
// same verbs the review offers — today, tomorrow, this week, drop — through
// the same handlers, so a verdict here cannot diverge from one given
// anywhere else. Nothing here is counted or nagged.
import { useMemo } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { TriageRow, applyTriageVerdict, type Verdict } from '@/components/schedule/TriageRow'
import type { Task } from '@/types/task'

export function SomedayPage() {
  const { tasks, loading, toggleTask, updateTask, deleteTask, pushTask, updateTasksBulk } = useSupabaseTasks()
  const { layers, all: showAllDomains } = useDomain()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))

  const setAside = useMemo(() => tasks.filter((t) => t.bucket === 'someday' && !t.completed), [tasks])
  const rows = useMemo(
    () => filterTasksForLayers(setAside, layers)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [setAside, layers],
  )
  // Empty because of the domain filter, not because nothing was set aside.
  const hiddenByFilter = rows.length === 0 && setAside.length > 0

  const viewedDate = useMemo(() => new Date(), [])
  const onVerdict = (t: Task, v: Verdict) => {
    void applyTriageVerdict(t, v, {
      viewedDate,
      onUpdateTask: (id, u) => gated.updateTask(id, u),
      onPushTask: (id, target) => gated.pushTask(id, target),
      onDeleteTask: (id) => { void deleteTask(id) },
    })
  }

  return (
    <div className="h-full overflow-auto">
      <div className={PAGE_COLUMN}>
        <MastheadCard
          variant="page"
          title="Someday"
          motif="history"
          subline="Set aside on purpose. Nothing here is counted or nagged — pull one back when its time comes."
        />
        <section aria-label="Someday" className="mt-4">
          {loading && rows.length === 0 ? (
            <p className="py-6 text-[15px] text-neutral-500">Loading…</p>
          ) : hiddenByFilter ? (
            <p className="py-6 text-[15px] text-neutral-500">
              Nothing set aside in the domains you're viewing.{' '}
              <button type="button" onClick={showAllDomains} className="font-medium text-primary-600 underline-offset-2 hover:underline">
                Show all domains
              </button>
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-[15px] text-neutral-500">Nothing set aside.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-200">
              {rows.map((t) => (
                <li key={t.id}>
                  <TriageRow
                    task={t}
                    lead="today"
                    offer={['today', 'tomorrow', 'week', 'deleted']}
                    canDelete
                    onVerdict={onVerdict}
                    onComplete={(task) => { void toggleTask(task.id) }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
