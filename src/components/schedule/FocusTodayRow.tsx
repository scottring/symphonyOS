import { Star } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { relativeStart } from '@/lib/today/relativeStart'

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
      <div className="flex items-center gap-1.5 mb-3 text-neutral-600">
        <Star className="w-4 h-4 text-amber-500" />
        <span className="text-[12px] font-medium tracking-wide text-neutral-500">HIGHLIGHTS</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((item) => {
          const rel = item.startTime ? relativeStart(item.startTime, new Date()) : ''
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item.id)}
              className="card text-left p-6 border-l-4 border-l-primary-400
                         shadow-md hover:shadow-lg transition-shadow
                         ring-1 ring-neutral-200/60"
            >
              <div className="text-[12px] text-neutral-400 font-medium">{timeLabel(item)}</div>
              {rel && (
                <div className="text-[11px] text-primary-600 font-medium mt-0.5 tracking-wide">
                  {rel}
                </div>
              )}
              <div className="text-[17px] md:text-[18px] font-medium text-neutral-800 mt-2 leading-snug">
                {item.title}
              </div>
              {item.location && (
                <div className="text-[12px] text-neutral-500 mt-2">{item.location}</div>
              )}
              {item.meetingUrl && (
                <div className="text-[12px] text-neutral-500 mt-2">Video call</div>
              )}
            </button>
          )
        })}
      </div>
      <div className="text-[12px] text-neutral-400 mt-2">
        {items.length} highlights · {totalEvents} total events
      </div>
    </section>
  )
}
