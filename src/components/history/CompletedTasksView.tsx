import { MastheadCard } from '@/components/layout/MastheadCard'
import { useState, useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'

interface CompletedTasksViewProps {
  tasks: Task[]
  contactsMap: Map<string, Contact>
  projectsMap: Map<string, Project>
  onSelectTask: (taskId: string) => void
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

export function CompletedTasksView({
  tasks,
  contactsMap,
  // projectsMap stays on the props — HistoryApp still hands it over — but
  // nothing here reads it any more (2026-09-02, see Sidebar.tsx).
  onSelectTask,
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

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header — shared Library masthead (design-unification 2026-09-01).
            The Back link and icon medallion died with it: History is a page. */}
        <MastheadCard
          variant="page"
          title="History"
          motif="history"
          subline={`${completedTasks.length} completed task${completedTasks.length !== 1 ? 's' : ''}`}
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
              placeholder="Search completed tasks..."
              className="w-full rounded-md border border-neutral-300 bg-bg-elevated py-3 pl-10 pr-4
                         text-[15px] placeholder:text-neutral-400
                         focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
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
        {filteredTasks.length > 0 ? (
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <div key={group.key}>
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                  {group.label}
                </h2>
                <div className="divide-y divide-neutral-200 border-y border-neutral-300">
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
              <div className="text-center py-4">
                <button
                  onClick={() => setVisibleMonths((prev) => prev + 3)}
                  className="text-[14px] font-medium text-primary-700 transition-colors hover:underline"
                >
                  Load more...
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-8 w-8 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="mb-1 font-display text-[24px] text-neutral-800">
              {searchQuery ? 'No matching tasks' : 'No completed tasks yet'}
            </h3>
            <p className="text-[15px] text-neutral-500">
              {searchQuery
                ? 'Try a different search term'
                : 'Completed tasks will appear here'}
            </p>
          </div>
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

  return (
    <button
      onClick={onSelect}
      className="flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50"
    >
      <div className="flex items-center gap-3">
        {/* Completed checkbox */}
        <span className="w-5 h-5 rounded bg-primary-500 flex items-center justify-center text-white flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>

        {/* Title */}
        <span className="flex-1 truncate text-[19px] leading-snug text-neutral-800">
          {task.title}
        </span>

        {/* Date */}
        <span className="shrink-0 text-[12px] text-neutral-400">
          {formatCompletionDate(task.updatedAt)}
        </span>

        {/* Chevron */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </div>

      {/* Metadata row: contact, notes. The project chip lived between them
          until Projects were hidden (2026-09-02 — see the note in Sidebar.tsx). */}
      {(contact || notesSnippet) && (
        <div className="ml-8 flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
          {contact && (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              {contact.name}
            </span>
          )}
          {notesSnippet && (
            <span className="italic">"{notesSnippet}"</span>
          )}
        </div>
      )}
    </button>
  )
}
