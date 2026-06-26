import { Star } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'

export interface FocusTodayRowProps {
  items: TimelineItem[]
  totalEvents: number
  onSelectItem: (id: string) => void
}

function timeLabel(i: TimelineItem): string {
  if (!i.startTime) return ''
  const f = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return i.endTime ? `${f(i.startTime)} – ${f(i.endTime)}` : f(i.startTime)
}

export function FocusTodayRow({ items, totalEvents, onSelectItem }: FocusTodayRowProps) {
  if (items.length === 0) return null
  return (
    <section className="mt-4">
      <div className="flex items-center gap-1.5 mb-2 text-neutral-600">
        <Star className="w-4 h-4 text-amber-500" />
        <span className="text-[12px] font-medium tracking-wide text-neutral-500">FOCUS TODAY</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((i) => (
          <button key={i.id} type="button" onClick={() => onSelectItem(i.id)}
            className="card text-left p-4 border-l-4 border-l-primary-400 hover:shadow-md transition">
            <div className="text-[12px] text-neutral-400">{timeLabel(i)}</div>
            <div className="text-[15px] font-medium text-neutral-800 mt-1">{i.title}</div>
            {i.location && <div className="text-[12px] text-neutral-500 mt-1">{i.location}</div>}
            {i.meetingUrl && <div className="text-[12px] text-neutral-500 mt-1">Video call</div>}
          </button>
        ))}
      </div>
      <div className="text-[12px] text-neutral-400 mt-2">{items.length} focus items · {totalEvents} total events</div>
    </section>
  )
}
