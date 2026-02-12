// EntryCard — Card wrapper around the interactive EntryRenderer

import type { Entry } from '@/types/entry'
import { DOMAIN_NAMES } from '@/types/manual'
import { EntryRenderer } from './renderers/EntryRenderer'

interface EntryCardProps {
  entry: Entry
  compact?: boolean
  onUpdate?: (updates: Partial<Entry>) => void
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

export function EntryCard({ entry, compact, onUpdate }: EntryCardProps) {
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
      <EntryRenderer entry={entry} onUpdate={onUpdate} mode="card" />
    </div>
  )
}
