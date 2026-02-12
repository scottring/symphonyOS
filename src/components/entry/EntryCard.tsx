// EntryCard — Universal entry renderer for all 9 content types

import type { Entry } from '@/types/entry'
import { DOMAIN_NAMES } from '@/types/manual'

interface EntryCardProps {
  entry: Entry
  compact?: boolean
}

const TYPE_LABELS: Record<string, string> = {
  insight: 'Insight',
  activity: 'Activity',
  goal: 'Goal',
  task: 'Task',
  reflection: 'Reflection',
  story: 'Story',
  checklist: 'Checklist',
  discussion: 'Discussion',
  milestone: 'Milestone',
}

const TYPE_COLORS: Record<string, string> = {
  insight: 'bg-blue-50 text-blue-600',
  activity: 'bg-green-50 text-green-600',
  goal: 'bg-purple-50 text-purple-600',
  task: 'bg-orange-50 text-orange-600',
  reflection: 'bg-amber-50 text-amber-700',
  story: 'bg-rose-50 text-rose-600',
  checklist: 'bg-teal-50 text-teal-600',
  discussion: 'bg-indigo-50 text-indigo-600',
  milestone: 'bg-yellow-50 text-yellow-700',
}

function renderContent(entry: Entry) {
  const c = entry.content
  switch (c.kind) {
    case 'story':
      return <p className="text-sm text-stone-600 line-clamp-3">{c.body}</p>
    case 'insight':
      return <p className="text-sm text-stone-600 line-clamp-3">{c.body}</p>
    case 'activity':
      return <p className="text-sm text-stone-600 line-clamp-3">{c.instructions}</p>
    case 'goal':
      return (
        <div>
          <p className="text-sm text-stone-600">{c.description}</p>
          {c.progress > 0 && (
            <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${c.progress}%` }} />
            </div>
          )}
        </div>
      )
    case 'task':
      return (
        <p className={`text-sm ${c.completed ? 'text-stone-400 line-through' : 'text-stone-600'}`}>
          {c.description}
        </p>
      )
    case 'reflection':
      return (
        <div>
          <p className="text-xs text-stone-400 italic mb-1">{c.prompt}</p>
          {c.response && <p className="text-sm text-stone-600">{c.response}</p>}
        </div>
      )
    case 'checklist':
      return (
        <ul className="space-y-1">
          {c.items.slice(0, 4).map(item => (
            <li key={item.id} className="text-sm text-stone-600 flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded border ${item.checked ? 'bg-stone-900 border-stone-900' : 'border-stone-300'} flex items-center justify-center`}>
                {item.checked && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              {item.label}
            </li>
          ))}
          {c.items.length > 4 && (
            <li className="text-xs text-stone-400">+{c.items.length - 4} more</li>
          )}
        </ul>
      )
    case 'discussion':
      return (
        <div>
          <p className="text-sm text-stone-600">{c.prompt}</p>
          {c.suggestedScript && (
            <p className="text-xs text-stone-400 mt-1 italic">Script: "{c.suggestedScript}"</p>
          )}
        </div>
      )
    case 'milestone':
      return (
        <div>
          <p className="text-sm text-stone-600">{c.description}</p>
          {c.achievedDate && (
            <p className="text-xs text-emerald-600 mt-1">Achieved {new Date(c.achievedDate).toLocaleDateString()}</p>
          )}
        </div>
      )
    default:
      return null
  }
}

export function EntryCard({ entry, compact }: EntryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className={`font-medium text-stone-800 ${compact ? 'text-sm' : ''}`}>{entry.title}</h3>
        <div className="flex gap-1.5 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TYPE_COLORS[entry.type] || 'bg-stone-50 text-stone-500'}`}>
            {TYPE_LABELS[entry.type] || entry.type}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-50 text-stone-400">
            {DOMAIN_NAMES[entry.domain]}
          </span>
        </div>
      </div>
      {renderContent(entry)}
    </div>
  )
}
