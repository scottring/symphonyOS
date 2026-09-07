import { Users } from 'lucide-react'
import { Widget } from './Widget'
import { WALL } from '../wallTheme'
import type { KidLine } from '@/lib/wall/memberPageModel'

/**
 * What a parent wants from a wall: each child's special today, and any
 * handoff that is theirs to drive. Each child is a tap (≥ 64px) that opens
 * their own page — one level deep, no deeper.
 */
export function KidsWidget({ kids, onOpenKid }: { kids: KidLine[]; onOpenKid: (id: string) => void }) {
  return (
    <Widget title="The kids" icon={Users}>
      {kids.length === 0 && <p className={`text-[1.05rem] ${WALL.muted}`}>No kids on the roster</p>}
      {kids.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => onOpenKid(k.id)}
          aria-label={`Open ${k.name}'s day`}
          className={`${WALL.cardInset} flex items-center gap-3 px-4 py-2 min-h-[64px] text-left active:scale-[.98] transition-transform`}
        >
          <span className={`font-display text-[1.3rem] w-[5.5rem] shrink-0 truncate ${WALL.inkStrong}`}>{k.name}</span>
          <div className="min-w-0">
            <div className={`text-[1.05rem] font-bold truncate ${k.special ? WALL.inkStrong : WALL.muted}`}>{k.special ?? 'Nothing special'}</div>
            {k.handoff && <div className={`text-[0.9rem] font-semibold truncate ${WALL.warn}`}>{k.handoff}</div>}
          </div>
        </button>
      ))}
    </Widget>
  )
}
