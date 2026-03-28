import type { BriefingData } from '@/lib/openBrain'

interface BriefingSectionProps {
  briefing: BriefingData
  onRefresh: () => void
}

export function BriefingSection({ briefing, onRefresh }: BriefingSectionProps) {
  const hasOverdue = briefing.overdueTasks.length > 0
  const hasDueToday = briefing.dueTodayTasks.length > 0
  const hasUpcoming = briefing.upcomingTasks.length > 0

  return (
    <div className="px-4 pt-3 pb-2 space-y-3">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-neutral-900">{briefing.greeting}</h1>
        <button
          onClick={() => onRefresh()}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Refresh briefing"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs text-neutral-500">
        {hasOverdue && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {briefing.overdueTasks.length} overdue
          </span>
        )}
        {hasDueToday && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {briefing.dueTodayTasks.length} due today
          </span>
        )}
        {hasUpcoming && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            {briefing.upcomingTasks.length} upcoming
          </span>
        )}
        {briefing.activeProjects.length > 0 && (
          <span>{briefing.activeProjects.length} active projects</span>
        )}
      </div>

      {/* Overdue tasks - only if present */}
      {hasOverdue && (
        <div className="rounded-xl bg-red-50/60 border border-red-100 p-3">
          <p className="text-xs font-medium text-red-700 mb-2">Overdue</p>
          <div className="space-y-1.5">
            {briefing.overdueTasks.slice(0, 3).map((t) => (
              <div key={t.slug} className="flex items-center gap-2 text-sm">
                <span className="text-red-400 text-xs">{t.daysOverdue}d</span>
                <span className="text-neutral-800 truncate">{t.title}</span>
              </div>
            ))}
            {briefing.overdueTasks.length > 3 && (
              <p className="text-xs text-red-500">+{briefing.overdueTasks.length - 3} more</p>
            )}
          </div>
        </div>
      )}

      {/* Due today */}
      {hasDueToday && (
        <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3">
          <p className="text-xs font-medium text-amber-700 mb-2">Due today</p>
          <div className="space-y-1.5">
            {briefing.dueTodayTasks.slice(0, 5).map((t) => (
              <div key={t.slug} className="text-sm text-neutral-800 truncate">
                {t.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No tasks state */}
      {!hasOverdue && !hasDueToday && !hasUpcoming && (
        <div className="rounded-xl bg-primary-50/40 border border-primary-100 p-3 text-center">
          <p className="text-sm text-primary-700">Your slate is clean. Nice work.</p>
        </div>
      )}
    </div>
  )
}
