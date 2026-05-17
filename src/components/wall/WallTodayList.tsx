import { Check, Clock, Repeat } from 'lucide-react'
import type { TodayItem } from './today/todayItem'
import type { FamilyMember } from '@/types/family'

interface WallTodayListProps {
  items: TodayItem[]
  members: FamilyMember[]
  onCheckItem: (id: string, completed: boolean) => void
  onTapEvent: (id: string) => void
}

function formatRowTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const dispH = h % 12 || 12
  return m === 0 ? `${dispH}${period}` : `${dispH}:${m.toString().padStart(2, '0')}${period}`
}

export function WallTodayList({ items, members, onCheckItem, onTapEvent }: WallTodayListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-white/40 py-3 text-center">Nothing for today.</p>
  }

  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const owner = members.find((m) => m.id === it.ownerId)
        const ownerColor = (owner as { color?: string } | undefined)?.color ?? null
        const isEvent = it.kind === 'event'

        return (
          <li
            key={it.id}
            className={`
              flex items-center gap-3 rounded-lg px-3 py-2.5 min-h-[56px]
              ${isEvent ? 'cursor-pointer hover:bg-white/5' : ''}
              ${it.completed ? 'opacity-50' : ''}
            `}
            onClick={isEvent ? () => onTapEvent(it.id) : undefined}
          >
            {isEvent ? (
              <Clock className="w-5 h-5 text-white/40 shrink-0" />
            ) : (
              <button
                type="button"
                aria-label={`Check ${it.title}`}
                onClick={(e) => { e.stopPropagation(); onCheckItem(it.id, !it.completed) }}
                className={`
                  w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors shrink-0
                  ${it.completed ? 'bg-emerald-700 border-emerald-700' : 'border-white/30 hover:border-white/60'}
                `}
              >
                {it.completed && <Check className="w-5 h-5 text-white" />}
              </button>
            )}

            <div className="flex-1 min-w-0">
              <div className={`text-base text-white ${it.completed ? 'line-through' : ''} truncate`}>
                {it.title}
                {it.kind === 'chore' && (
                  <Repeat className="inline-block w-3 h-3 ml-1.5 text-white/40" />
                )}
              </div>
              {it.startTime && (
                <div className="text-[11px] text-white/40 mt-0.5">{formatRowTime(it.startTime)}</div>
              )}
            </div>

            {owner && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                style={{ background: ownerColor ?? '#2d4f3a' }}
                title={owner.name}
              >
                {owner.name.charAt(0).toUpperCase()}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
