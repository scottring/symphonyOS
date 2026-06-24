import { useState } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'

interface Props {
  item: TimelineItem // type === 'routine-collection'
  onSelect: () => void
  onCompleteStep: (stepEntityId: string, completed: boolean) => void
}

function fmt(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

export function RoutineCollectionRow({ item, onSelect, onCompleteStep }: Props) {
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
        <div className="border-t border-neutral-100 px-3 py-1.5 space-y-1">
          {(item.steps ?? []).map(step => (
            <div key={step.id} className="flex items-center gap-2 py-1">
              <button
                onClick={() => onCompleteStep(step.id, !step.completed)}
                aria-label={step.completed ? 'Mark step incomplete' : 'Mark step complete'}
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${step.completed ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300'}`}
              >
                {step.completed && <Check className="w-3 h-3" />}
              </button>
              <span
                className={`text-sm flex-1 truncate ${step.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}
                onClick={onSelect}
              >
                {step.title}
              </span>
              {step.startTime && <span className="text-xs text-neutral-400">{step.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
