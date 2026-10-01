import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { GroupLabel } from '@/components/layout/SectionHeading'
import { EmptyState } from '@/components/layout/EmptyState'
import { LIST_ROW, LIST_ROW_BODY, LIST_ROW_LANE, LIST_ROW_META, LIST_ROW_TITLE, LIST_ROW_TRAIL } from '@/components/layout/listRow'
import { LoadFailedNotice } from '@/components/common/LoadFailedNotice'
import { useState, useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'

interface CompletedTasksViewProps {
  tasks: Task[]
  contactsMap: Map<string, Contact>
  projectsMap: Map<string, Project>
  onSelectTask: (taskId: string) => void
  /** The first task fetch is in flight — "0 completed tasks" would be a guess. */
  loading?: boolean
  /** The task read failed and nothing arrived. */
  loadFailed?: boolean
  /** Reload the tasks (the tasks hook's refetch). */
  onRetry?: () => void
  /** Kept for call-site compatibility; the masthead no longer renders Back. */
  onBack?: () => void
}

// Group tasks by month
interface MonthGroup {
  label: string
  key: string
  tasks: Task[]
}

function groupByMonth(tasks: Task[]): MonthGroup[] {
  const groups = new Map<string, Task[]>()

  for (const task of tasks) {
    const date = task.updatedAt
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const existing = groups.get(key) || []
    existing.push(task)
    groups.set(key, existing)
  }

  // Convert to array and sort by date (most recent first)
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, tasks]) => {
      const [year, month] = key.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      return {
        key,
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        tasks: tasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      }
    })
}

function formatCompletionDate(date: Date): string {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The phone lane is 40px: "Yesterday" doesn't fit it, "Yest." does. */
function formatCompletionDateShort(date: Date): string {
  const full = formatCompletionDate(date)
  return full === 'Yesterday' ? 'Yest.' : full
}

export function CompletedTasksView({
  tasks,
  contactsMap,
  // projectsMap stays on the props — HistoryApp still hands it over — but
  // nothing here reads it any more (2026-09-02, see Sidebar.tsx).
  onSelectTask,
  loading = false,
  loadFailed = false,
  onRetry,
}: CompletedTasksViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleMonths, setVisibleMonths] = useState(3)

  // Filter to completed tasks only
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.completed && !t.parentTaskId),
    [tasks]
  )

  // Apply search filter
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return completedTasks

    const query = searchQuery.toLowerCase()
    return completedTasks.filter((task) => {
      // Search in title
      if (task.title.toLowerCase().includes(query)) return true
      // Search in notes
      if (task.notes?.toLowerCase().includes(query)) return true
      // Search in contact name
      if (task.contactId) {
        const contact = contactsMap.get(task.contactId)
        if (contact?.name.toLowerCase().includes(query)) return true
      }
      // Project name was searchable here until Projects were hidden from the
      // product (2026-09-02 — see the note in Sidebar.tsx). It had to go with
      // the row's chip: matching on a name the row never shows returns results
      // with no visible reason for matching.
      return false
    })
  }, [completedTasks, searchQuery, contactsMap])

  // Group by month
  const monthGroups = useMemo(() => groupByMonth(filteredTasks), [filteredTasks])

  // Visible groups (for pagination)
  const visibleGroups = monthGroups.slice(0, visibleMonths)
  const hasMore = monthGroups.length > visibleMonths
  // Until the list has arrived (or while it failed to) the page states no
  // count and no "No completed tasks yet" — those would be guesses.
  const pending = loading && completedTasks.length === 0
  const failed = !pending && loadFailed && completedTasks.length === 0 && !!onRetry

  return (
    <div className="h-full overflow-auto">
      <div className={PAGE_COLUMN}>
        {/* Header — shared Library masthead (design-unification 2026-09-01).
            The Back link and icon medallion died with it: History is a page. */}
        <MastheadCard
          variant="page"
          title="History"
          motif="history"
          subline={pending ? 'Loading…' : failed ? 'Didn’t load' : `${completedTasks.length} completed task${completedTasks.length !== 1 ? 's' : ''}`}
        />

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search completed tasks"
              placeholder="Search completed tasks..."
              className="w-full rounded-md border border-neutral-300 bg-bg-elevated py-3 pl-10 pr-4
                         text-[15px] placeholder:text-neutral-400
                         focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Task list by month */}
        {pending ? (
          <EmptyState title="Loading your history…" />
        ) : failed ? (
          <LoadFailedNotice
            className="py-4"
            title="Your history didn’t load."
            body="Your completed tasks are safe — this is a connection problem."
            onRetry={onRetry!}
          />
        ) : filteredTasks.length > 0 ? (
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <div key={group.key}>
                <GroupLabel>{group.label}</GroupLabel>
                <div>
                  {group.tasks.map((task) => (
                    <TaskHistoryRow
                      key={task.id}
                      task={task}
                      contact={task.contactId ? contactsMap.get(task.contactId) : undefined}
                      onSelect={() => onSelectTask(task.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more button */}
            {hasMore && (
              <div className="py-2">
                <button
                  onClick={() => setVisibleMonths((prev) => prev + 3)}
                  className="-ml-3 rounded-md px-3 py-2 text-[14px] font-medium text-primary-700 transition-colors hover:underline"
                >
                  Load more...
                </button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState title={searchQuery ? 'No matching tasks' : 'No completed tasks yet'}>
            {searchQuery ? 'Try a different search term.' : 'Tasks you finish land here, by the month you finished them.'}
          </EmptyState>
        )}
      </div>
    </div>
  )
}

// Individual task row component
function TaskHistoryRow({
  task,
  contact,
  onSelect,
}: {
  task: Task
  contact?: Contact
  onSelect: () => void
}) {
  // Truncate notes to ~60 chars
  const notesSnippet = task.notes
    ? task.notes.length > 60
      ? task.notes.slice(0, 60) + '...'
      : task.notes
    : null

  const when = formatCompletionDate(task.updatedAt)
  const whenShort = formatCompletionDateShort(task.updatedAt)

  // The library row: the completion date in the margin lane, the title at
  // the body edge with who/notes under it, the done mark and chevron trailing.
  return (
    <button
      type="button"
      onClick={onSelect}
      className={LIST_ROW}
    >
      <span className={LIST_ROW_LANE}>
        <time dateTime={task.updatedAt.toISOString()} title={task.updatedAt.toLocaleDateString()}>
          {whenShort !== when ? (
            <>
              <span className="md:hidden">{whenShort}</span>
              <span className="hidden md:inline">{when}</span>
            </>
          ) : when}
        </time>
      </span>

      <span className={LIST_ROW_BODY}>
        <span className={LIST_ROW_TITLE}>{task.title}</span>
        {/* Metadata: contact, notes. The project chip lived between them
            until Projects were hidden (2026-09-02 — see the note in Sidebar.tsx). */}
        {(contact || notesSnippet) && (
          <span className={`${LIST_ROW_META} flex items-center gap-2`}>
            {contact && (
              <span className="flex shrink-0 items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                {contact.name}
              </span>
            )}
            {notesSnippet && (
              <span className="min-w-0 truncate italic">"{notesSnippet}"</span>
            )}
          </span>
        )}
      </span>

      <span className={LIST_ROW_TRAIL}>
        {/* Done mark — every row here is finished; it says so at a glance. */}
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-4 h-4 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    </button>
  )
}
