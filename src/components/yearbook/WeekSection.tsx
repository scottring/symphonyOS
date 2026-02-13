// WeekSection — Renders a single week of the yearbook as a progress journal
// Shows: progress summary, entries by type, harmony highlights

import type { Entry } from '@/types/entry'
import type { YearbookChapter } from '@/types/yearbook'
import { YearbookEntryCard } from './YearbookEntryCard'
import { DOMAIN_NAMES } from '@/types/manual'
import type { DomainId } from '@/types/manual'

interface WeekSectionProps {
  chapter: YearbookChapter
  entries: Entry[]
  onUpdateEntry?: (entryId: string, updates: Partial<Entry>) => void
}

const FULL_WIDTH_TYPES = new Set(['story', 'reflection', 'milestone'])

function formatDateRange(start?: string, end?: string): string {
  if (!start) return ''
  const s = new Date(start + 'T00:00:00')
  const e = end ? new Date(end + 'T00:00:00') : s
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startStr = s.toLocaleDateString('en-US', opts)
  const endStr = e.toLocaleDateString('en-US', opts)
  if (startStr === endStr) return startStr
  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'short' })} ${s.getDate()}–${e.getDate()}`
  }
  return `${startStr} – ${endStr}`
}

export function WeekSection({ chapter, entries, onUpdateEntry }: WeekSectionProps) {
  if (entries.length === 0 && !chapter.progress) return null

  const progress = chapter.progress
  const dateRange = formatDateRange(chapter.period?.start, chapter.period?.end)

  // Separate entries by layout
  const stories = entries.filter(e => e.type === 'story')
  const fullWidth = entries.filter(e => FULL_WIDTH_TYPES.has(e.type) && e.type !== 'story')
  const gridEntries = entries.filter(e => !FULL_WIDTH_TYPES.has(e.type) && e.type !== 'task')
  const tasks = entries.filter(e => e.type === 'task')

  return (
    <section id={`chapter-${chapter.id}`} className="mb-14 scroll-mt-20">
      {/* Week header */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl md:text-3xl font-semibold text-stone-900">
            {chapter.title}
          </h2>
          {dateRange && (
            <span className="text-sm text-stone-400">{dateRange}</span>
          )}
        </div>
        {chapter.description && (
          <p className="text-sm text-stone-500 mt-1.5 leading-relaxed max-w-2xl">
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

      {/* Progress summary card */}
      {progress && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-5 mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider text-stone-400 mb-3">
            This Week's Progress
          </h3>

          {/* Highlights */}
          {progress.highlights.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {progress.highlights.map((h, i) => (
                <p key={i} className="text-sm text-stone-700 flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                  {h}
                </p>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 text-xs text-stone-500">
            {progress.actionsCompleted.length > 0 && (
              <span>
                <span className="font-medium text-stone-700">{progress.actionsCompleted.length}</span> actions completed
              </span>
            )}
            {progress.symphonyItemsCompleted.length > 0 && (
              <span>
                <span className="font-medium text-stone-700">{progress.symphonyItemsCompleted.length}</span> items done
              </span>
            )}
            {progress.domainsAssessed.length > 0 && (
              <span>
                Assessed: {progress.domainsAssessed.map(d => DOMAIN_NAMES[d as DomainId]).join(', ')}
              </span>
            )}
          </div>

          {/* Harmony changes */}
          {Object.keys(progress.harmonyChanges).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(progress.harmonyChanges).map(([domain, delta]) => {
                if (!delta) return null
                const isUp = delta > 0
                return (
                  <span
                    key={domain}
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      isUp
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {DOMAIN_NAMES[domain as DomainId]} {isUp ? '+' : ''}{delta}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Stories — featured, full-width with extra prominence */}
      {stories.length > 0 && (
        <div className="space-y-6 mb-6">
          {stories.map(entry => (
            <YearbookEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={onUpdateEntry ? (updates) => onUpdateEntry(entry.id, updates) : undefined}
            />
          ))}
        </div>
      )}

      {/* Other full-width entries (reflections, milestones) */}
      {fullWidth.length > 0 && (
        <div className="space-y-6 mb-6">
          {fullWidth.map(entry => (
            <YearbookEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={onUpdateEntry ? (updates) => onUpdateEntry(entry.id, updates) : undefined}
            />
          ))}
        </div>
      )}

      {/* Grid entries (activities, checklists, discussions, goals, insights) */}
      {gridEntries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
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
