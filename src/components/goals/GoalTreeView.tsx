// GoalTreeView — Collapsible goal hierarchy with quarterly breakdown
// Shows Year goal → Q1-Q4 actions with progress rollup

import { useState } from 'react'
import type { Goal, GoalArea, Quarter } from '@/types/goal'
import { DOMAIN_NAMES } from '@/types/manual'
import type { DomainId } from '@/types/manual'

interface GoalTreeViewProps {
  areas: GoalArea[]
  goals: Goal[]
  currentQuarter: Quarter
  onToggleAction: (actionId: string) => void
  onSelectGoal: (goalId: string) => void
}

export function GoalTreeView({
  areas,
  goals,
  currentQuarter,
  onToggleAction,
  onSelectGoal,
}: GoalTreeViewProps) {
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())

  const toggleExpanded = (goalId: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev)
      if (next.has(goalId)) next.delete(goalId)
      else next.add(goalId)
      return next
    })
  }

  const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

  // Try to extract domain from goal notes (we store "Domain: xyz" in notes when importing)
  const getDomainFromNotes = (notes?: string): DomainId | null => {
    if (!notes) return null
    const match = notes.match(/Domain:\s*(\w+)/)
    return match ? (match[1] as DomainId) : null
  }

  return (
    <div className="space-y-6">
      {areas.map(area => {
        const areaGoals = goals.filter(g => g.areaId === area.id && g.status !== 'archived')
        if (areaGoals.length === 0) return null

        return (
          <section key={area.id}>
            <h3 className="font-display text-base font-semibold text-neutral-600 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
              </svg>
              {area.name}
            </h3>

            <div className="space-y-2">
              {areaGoals.map(goal => {
                const isExpanded = expandedGoals.has(goal.id)
                const totalActions = goal.actions.length
                const completedActions = goal.actions.filter(a => a.completed).length
                const progressPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0
                const domain = getDomainFromNotes(goal.notes)

                return (
                  <div key={goal.id} className="rounded-2xl border border-neutral-100 bg-white overflow-hidden">
                    {/* Goal header — clickable to expand */}
                    <button
                      onClick={() => toggleExpanded(goal.id)}
                      className="w-full text-left p-4 flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-neutral-800 truncate">{goal.name}</span>
                          {domain && DOMAIN_NAMES[domain] && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600 shrink-0">
                              {DOMAIN_NAMES[domain]}
                            </span>
                          )}
                        </div>
                        {goal.notes && (
                          <p className="text-xs text-neutral-400 truncate">
                            {goal.notes.replace(/Domain:\s*\w+\s*\|\s*/, '')}
                          </p>
                        )}
                      </div>

                      {/* Overall progress */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-400 font-medium tabular-nums w-10 text-right">
                          {completedActions}/{totalActions}
                        </span>
                      </div>
                    </button>

                    {/* Expanded: quarterly breakdown */}
                    {isExpanded && (
                      <div className="border-t border-neutral-100 px-4 pb-4">
                        {quarters.map(q => {
                          const quarterActions = goal.actions.filter(a => a.quarter === q)
                          const isCurrent = q === currentQuarter
                          const qCompleted = quarterActions.filter(a => a.completed).length

                          return (
                            <div key={q} className="mt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                                  isCurrent
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'bg-neutral-100 text-neutral-500'
                                }`}>
                                  {q}
                                  {isCurrent && ' — Current'}
                                </span>
                                {quarterActions.length > 0 && (
                                  <span className="text-[10px] text-neutral-400 tabular-nums">
                                    {qCompleted}/{quarterActions.length}
                                  </span>
                                )}
                              </div>

                              {quarterActions.length === 0 ? (
                                <p className="text-xs text-neutral-300 italic pl-4">No actions</p>
                              ) : (
                                <div className="space-y-1.5 pl-1">
                                  {quarterActions.map(action => (
                                    <div key={action.id} className="flex items-start gap-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onToggleAction(action.id) }}
                                        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                                          action.completed
                                            ? 'bg-primary-500 border-primary-500 text-white'
                                            : 'border-neutral-300 hover:border-primary-400'
                                        }`}
                                      >
                                        {action.completed && (
                                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                      </button>
                                      <span className={`text-sm ${action.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                                        {action.description}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Link to full goal view */}
                        <button
                          onClick={() => onSelectGoal(goal.id)}
                          className="mt-4 text-xs text-primary-500 hover:text-primary-600 font-medium transition-colors"
                        >
                          Open full goal view →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
