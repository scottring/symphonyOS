// ChapterSection — Renders a yearbook chapter with header and mixed-width entries
// Full-width: Story, Reflection, Milestone
// 2-column grid: Activity, Checklist, Discussion, Goal, Insight
// Grouped: Tasks

import type { Entry } from '@/types/entry'
import type { YearbookChapter } from '@/types/yearbook'
import { YearbookEntryCard } from './YearbookEntryCard'

interface ChapterSectionProps {
  chapter: YearbookChapter
  entries: Entry[]
  onUpdateEntry?: (entryId: string, updates: Partial<Entry>) => void
}

const FULL_WIDTH_TYPES = new Set(['story', 'reflection', 'milestone'])

export function ChapterSection({ chapter, entries, onUpdateEntry }: ChapterSectionProps) {
  if (entries.length === 0) return null

  // Separate entries by layout type
  const fullWidth = entries.filter(e => FULL_WIDTH_TYPES.has(e.type))
  const gridEntries = entries.filter(e => !FULL_WIDTH_TYPES.has(e.type) && e.type !== 'task')
  const tasks = entries.filter(e => e.type === 'task')

  return (
    <section id={`chapter-${chapter.id}`} className="mb-16 scroll-mt-20">
      {/* Chapter header */}
      <div className="mb-8">
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 leading-tight">
          {chapter.title}
        </h2>
        {chapter.description && (
          <p className="text-base text-stone-500 mt-2 leading-relaxed max-w-2xl">
            {chapter.description}
          </p>
        )}
        {/* Decorative divider */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-stone-200" />
          <div className="w-1.5 h-1.5 rounded-full bg-stone-300" />
          <div className="h-px flex-1 bg-stone-200" />
        </div>
      </div>

      {/* Full-width entries */}
      {fullWidth.length > 0 && (
        <div className="space-y-6 mb-8">
          {fullWidth.map(entry => (
            <YearbookEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={onUpdateEntry ? (updates) => onUpdateEntry(entry.id, updates) : undefined}
            />
          ))}
        </div>
      )}

      {/* Grid entries (2-column) */}
      {gridEntries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {gridEntries.map(entry => (
            <YearbookEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={onUpdateEntry ? (updates) => onUpdateEntry(entry.id, updates) : undefined}
            />
          ))}
        </div>
      )}

      {/* Tasks grouped */}
      {tasks.length > 0 && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-stone-400 mb-3">Tasks</h3>
          <div className="space-y-2">
            {tasks.map(entry => (
              <YearbookEntryCard
                key={entry.id}
                entry={entry}
                onUpdate={onUpdateEntry ? (updates) => onUpdateEntry(entry.id, updates) : undefined}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
