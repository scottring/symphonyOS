// EntryRenderer — Dispatcher that routes to type-specific renderers

import type { Entry } from '@/types/entry'
import { StoryRenderer } from './StoryRenderer'
import { ChecklistRenderer } from './ChecklistRenderer'
import { GoalRenderer } from './GoalRenderer'
import { TaskRenderer } from './TaskRenderer'
import { ReflectionRenderer } from './ReflectionRenderer'
import { ActivityRenderer } from './ActivityRenderer'
import { DiscussionRenderer } from './DiscussionRenderer'
import { MilestoneRenderer } from './MilestoneRenderer'
import { InsightRenderer } from './InsightRenderer'

export interface EntryRendererProps {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full'
}

export function EntryRenderer({ entry, onUpdate, mode = 'card' }: EntryRendererProps) {
  const c = entry.content
  switch (c.kind) {
    case 'story':
      return <StoryRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'checklist':
      return <ChecklistRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'goal':
      return <GoalRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'task':
      return <TaskRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'reflection':
      return <ReflectionRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'activity':
      return <ActivityRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'discussion':
      return <DiscussionRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'milestone':
      return <MilestoneRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    case 'insight':
      return <InsightRenderer entry={entry} onUpdate={onUpdate} mode={mode} />
    default:
      return <p className="text-sm text-stone-400 italic">Unknown entry type</p>
  }
}
