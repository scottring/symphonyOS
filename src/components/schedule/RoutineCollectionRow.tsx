import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'

interface Props {
  item: TimelineItem // type === 'routine-collection'
  onSelect: () => void
  onSelectStep: (stepTimelineId: string) => void
  onCompleteStep: (stepEntityId: string, completed: boolean) => void
}

function fmt(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Compact pill label, e.g. "7a", "10a", "1:30p". */
function fmtShort(t: string | null): string {
  if (!t) return 'anytime'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const hr = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`
}

export function RoutineCollectionRow({ item, onSelectStep, onCompleteStep }: Props) {
  const [open, setOpen] = useState(false)
  const p = item.collectionProgress ?? { done: 0, total: 0 }
  const nextUp = item.collectionNextUp
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-800 truncate">{item.title}</span>
            <span className="text-xs text-neutral-400">{p.done} / {p.total}</span>
          </div>
          {item.completed
            ? <span className="text-xs text-neutral-400">Done</span>
            : nextUp && <span className="text-xs text-neutral-500">Next up: {fmt(nextUp.time)} {nextUp.stepName}</span>}
        </div>
      </button>
      {open && (
        <div className="border-t border-neutral-100 px-3 py-2 space-y-2.5">
          {/* One row per exercise; its doses are tappable pills (filled = done). */}
          {(item.collectionSteps ?? []).map(group => {
            const stepDone = group.progress.done === group.progress.total && group.progress.total > 0
            return (
              <div key={group.stepId}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate cursor-pointer ${stepDone ? 'text-neutral-400' : 'text-neutral-700'}`}
                    onClick={() => onSelectStep(`routine-${group.stepId}`)}
                  >
                    {group.name}
                  </span>
                  <span className="text-xs text-neutral-400 flex-none">{group.progress.done}/{group.progress.total}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {group.doses.map(dose => (
                    <button
                      key={dose.id}
                      onClick={() => onCompleteStep(dose.id, !dose.completed)}
                      aria-label={`${dose.completed ? 'Uncomplete' : 'Complete'} ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`}
                      className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                        dose.completed
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white border-neutral-300 text-neutral-600 hover:border-primary-300'
                      }`}
                    >
                      {fmtShort(dose.time)}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
