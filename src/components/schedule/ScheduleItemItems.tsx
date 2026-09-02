import { Check } from 'lucide-react'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { isSameDay } from '@/lib/dateUtils'

/**
 * The per-person items under a block (spec §4.4).
 *
 * A school email becomes one all-day block ("Picture Day") plus one row per
 * person for what that person has to do. Those rows are the whole point of the
 * block, so they render ALWAYS and at EVERY width — not behind the desktop-only
 * steps disclosure, which exists for plain subtasks where the parent is the
 * commitment and the steps are detail.
 *
 * Each row is: a check that completes it, the member's pill, the text, and a
 * quiet hint when the thing is needed on a day other than the block's own.
 */
interface ScheduleItemItemsProps {
  items: Task[]
  members: FamilyMember[]
  onToggle?: (id: string) => void
  /**
   * The day being LOOKED AT, not the wall clock. A needed-on date expires by
   * ceasing to match the viewed day (src/lib/today/neededToday.ts); the hint
   * has to follow the same rule or it lies while you page through the week.
   */
  viewedDate?: Date
}

/**
 * "today" when the item is needed on the day being viewed, "tonight" when it is
 * needed the evening before (get the shirt out now, wear it tomorrow). Anything
 * further out gets no hint — the block's own date already says when.
 */
function neededHint(neededOn: Date | undefined, viewedDate: Date): 'today' | 'tonight' | null {
  if (!neededOn) return null
  if (isSameDay(neededOn, viewedDate)) return 'today'
  const eve = new Date(viewedDate)
  eve.setDate(eve.getDate() - 1)
  return isSameDay(neededOn, eve) ? 'tonight' : null
}

export function ScheduleItemItems({ items, members, onToggle, viewedDate }: ScheduleItemItemsProps) {
  if (items.length === 0) return null
  const day = viewedDate ?? new Date()

  return (
    <ul className="mt-1 space-y-1 border-l-2 border-neutral-200 pl-3">
      {items.map((it) => {
        const member = members.find((m) => m.id === it.assignedTo)
        const hint = neededHint(it.neededOn, day)
        return (
          // min-h-11 (44px) is not decoration: the check below pads out to a
          // 40px tap box, and the row has to be tall enough to hold it. When
          // the row was only as tall as its 16px circle, consecutive boxes
          // overlapped and a tap in the seam completed the WRONG kid's item.
          <li key={it.id} className="flex items-center gap-1.5 min-w-0 min-h-11">
            <button
              type="button"
              aria-label={`Complete ${it.title}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggle?.(it.id)
              }}
              className="shrink-0 flex items-center justify-center"
              // index.css has an UNLAYERED `button[aria-label] { min-height:
              // 48px; min-width: 48px; padding: .75rem }` under 768px, which
              // beats every Tailwind utility (see the tailwind-v4 note) and
              // blew this into a 48px ring. Inline style is the only thing that
              // wins.
              //
              // 12px of padding around the 16px circle makes a 40x40 tap box.
              // It used to be `padding: 8, margin: -8` — a 32px box pulled back
              // OUT of the row, so adjacent boxes overlapped in the gap between
              // rows and a tap in the seam completed the next kid's item. The
              // padding now stays inside the row (min-h-11 above reserves the
              // height) and the drawn circle is still 16px.
              style={{ minHeight: 0, minWidth: 0, padding: 12 }}
            >
              <span className="grid place-items-center w-4 h-4 rounded-full border-[1.5px] border-neutral-300 text-transparent hover:border-primary-500 hover:text-primary-500 transition-colors">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </span>
            </button>
            {member && <AssigneeAvatar member={member} size="sm" className="shrink-0" />}
            {/* min-w-0 (not flex-1) so the hint stays beside the title instead
                of being pushed to the far edge of a wide row, while a long
                title still shrinks and wraps on a phone. */}
            <span className="min-w-0 text-[13px] text-neutral-600 line-clamp-2 break-words">
              {it.title}
            </span>
            {hint && (
              <span className="shrink-0 text-[11px] text-neutral-400">{hint}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
