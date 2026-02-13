// ActionQueue — Suggested actions from domain assessment with approve/dismiss
// Actions can be pushed to Symphony as tasks, routines, projects, or goals

import { useState } from 'react'
import type { ActionItem } from '@/types/manual'

const EFFORT_LABELS: Record<string, string> = {
  quick_win: 'Quick win',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  ongoing: 'Ongoing',
}

const TYPE_LABELS: Record<string, string> = {
  task: 'Task',
  routine: 'Routine',
  project: 'Project',
  goal: 'Goal',
}

const TYPE_ICONS: Record<string, string> = {
  task: 'M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z',
  routine: 'M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.218.218a7 7 0 0011.712-3.138.75.75 0 00-1.449-.394zm.137-7.868a.75.75 0 00-1.5 0v2.134l-.217-.218A7 7 0 002.02 8.61a.75.75 0 001.45.394A5.5 5.5 0 0112.69 6.54l.311.31H10.57a.75.75 0 000 1.5h3.951a.75.75 0 00.75-.75V3.556z',
  project: 'M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5z',
  goal: 'M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z',
}

const PRIORITY_COLORS: Record<string, string> = {
  now: 'text-red-600 bg-red-50',
  soon: 'text-amber-600 bg-amber-50',
  later: 'text-stone-500 bg-stone-100',
}

interface ActionQueueProps {
  actions: ActionItem[]
  onAccept?: (actionId: string) => void
  onDismiss?: (actionId: string) => void
  onAddToSymphony?: (action: ActionItem) => void
  onNavigateToItem?: (symphonyItemId: string, type: ActionItem['type']) => void
  pushing?: boolean
  compact?: boolean
}

export function ActionQueue({ actions, onAccept, onDismiss, onAddToSymphony, onNavigateToItem, pushing = false, compact = false }: ActionQueueProps) {
  if (actions.length === 0) return null

  const suggested = actions.filter(a => a.status === 'suggested')
  const accepted = actions.filter(a => a.status === 'accepted' || a.status === 'in_progress')
  const linked = actions.filter(a => !!a.symphonyItemId)

  return (
    <div className="space-y-3">
      {/* Suggested actions */}
      {suggested.length > 0 && (
        <div>
          {!compact && (
            <h5 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Suggested</h5>
          )}
          <div className="space-y-2">
            {suggested.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onAccept={onAccept}
                onDismiss={onDismiss}
                onAddToSymphony={onAddToSymphony}
                onNavigateToItem={onNavigateToItem}
                pushing={pushing}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {/* Accepted / In progress (not yet linked) */}
      {accepted.length > 0 && (
        <div>
          {!compact && (
            <h5 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">In progress</h5>
          )}
          <div className="space-y-2">
            {accepted.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onAddToSymphony={onAddToSymphony}
                onNavigateToItem={onNavigateToItem}
                pushing={pushing}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {/* Linked to Symphony */}
      {linked.length > 0 && !compact && (
        <div>
          <h5 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
            In Symphony ({linked.length})
          </h5>
          <div className="space-y-2">
            {linked.map(action => (
              <ActionCard
                key={action.id}
                action={action}
                onNavigateToItem={onNavigateToItem}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionCard({ action, onAccept, onDismiss, onAddToSymphony, onNavigateToItem, pushing, compact }: {
  action: ActionItem
  onAccept?: (id: string) => void
  onDismiss?: (id: string) => void
  onAddToSymphony?: (action: ActionItem) => void
  onNavigateToItem?: (symphonyItemId: string, type: ActionItem['type']) => void
  pushing?: boolean
  compact?: boolean
}) {
  const isLinked = !!action.symphonyItemId
  const [expanded, setExpanded] = useState(false)

  // Check if description is long enough to need truncation (~120 chars ≈ 2 lines)
  const isLongDescription = !compact && action.description && action.description.length > 120

  return (
    <div className={`border border-stone-200 rounded-lg ${compact ? 'p-3' : 'p-4'} bg-white`}>
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className="shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-stone-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d={TYPE_ICONS[action.type] || TYPE_ICONS.task} clipRule="evenodd" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h6 className="text-sm font-medium text-stone-800">{action.title}</h6>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY_COLORS[action.priority]}`}>
              {action.priority}
            </span>
          </div>

          {!compact && action.description && (
            <div>
              <p className={`text-xs text-stone-500 mt-1 ${!expanded ? 'line-clamp-2' : ''}`}>
                {action.description}
              </p>
              {isLongDescription && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-stone-400 hover:text-stone-600 mt-0.5 transition-colors"
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          {/* Metadata chips */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
              {TYPE_LABELS[action.type]}
            </span>
            <span className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
              {EFFORT_LABELS[action.effort]}
            </span>
            {action.estimatedTime && (
              <span className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
                {action.estimatedTime}
              </span>
            )}
            {isLinked && (
              <button
                onClick={() => action.symphonyItemId && onNavigateToItem?.(action.symphonyItemId, action.symphonyItemType || action.type)}
                className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded hover:bg-emerald-100 transition-colors"
              >
                In Symphony
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Action buttons for suggested items */}
          {action.status === 'suggested' && (onAccept || onDismiss || onAddToSymphony) && (
            <div className="flex items-center gap-2 mt-3">
              {onAddToSymphony && (
                <button
                  onClick={() => onAddToSymphony(action)}
                  disabled={pushing}
                  className="text-xs font-medium px-3 py-1.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors"
                >
                  {pushing ? 'Adding...' : 'Add to Symphony'}
                </button>
              )}
              {onAccept && !onAddToSymphony && (
                <button
                  onClick={() => onAccept(action.id)}
                  className="text-xs font-medium px-3 py-1.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
                >
                  Accept
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={() => onDismiss(action.id)}
                  className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {/* For accepted items not yet in Symphony */}
          {action.status === 'accepted' && !isLinked && onAddToSymphony && (
            <div className="mt-3">
              <button
                onClick={() => onAddToSymphony(action)}
                disabled={pushing}
                className="text-xs font-medium px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 disabled:opacity-50 transition-colors"
              >
                {pushing ? 'Adding...' : 'Add to Symphony'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
