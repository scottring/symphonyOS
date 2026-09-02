// Full-screen per-member day page for the wall kiosk: "what does MY day look
// like." Same overlay layer as WallRecipeViewer. Collections render first as
// titled cards, then standalone routines/tasks band by time of day. A target
// routine (read >= 20 min) shows progress + a streak line and expands to log
// more; a plain routine or an assigned task is a straight checkbox tap.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Flame, Mail } from 'lucide-react'
import { WALL } from './wallTheme'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useMemberInstanceHistory } from './useMemberInstanceHistory'
import { buildMemberDayModel } from '@/lib/wall/kidDayModel'
import type { KidRow, KidNeededRow, KidHomeworkRow, KidNoticeRow, KidBandKey, MemberDayModel } from '@/lib/wall/kidDayModel'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'
import type { WallNotice } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

/** How long the page sits idle before it auto-returns to the wall. */
export const KID_VIEW_IDLE_MS = 120_000

// These are KidBandKeys (kidDayModel's own total re-partition of the day —
// see bandForTime), NOT DaySections. Do not confuse this with a hand-rolled
// DaySection sweep; see sectionCoverage.test.ts's ALLOWED entry for this file.
const BAND_ORDER: KidBandKey[] = ['morning', 'afternoon', 'evening', 'anytime']
const BAND_LABELS: Record<KidBandKey, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
}
const MINUTE_CHIPS = [5, 10, 20]
const COUNT_CHIPS = [1]

interface KidDayViewProps {
  member: FamilyMember
  /** Raw routines, from useWallData. */
  routines: Routine[]
  todayItems: Record<DaySection, TimelineItem[]>
  /** Incomplete tasks carrying `needed_on`, from useWallData's narrow query.
   *  They have no `scheduled_for`, so they are absent from `todayItems`. */
  neededTasks: Task[]
  /** Open homework, any date, from useWallData's own query. The Homework
   *  card owns these rows; the model keeps them out of needed/bands. */
  homeworkTasks: Task[]
  /** Standing info from school, last 14 days. */
  notices: WallNotice[]
  /** Complete/uncomplete a TASK row — the Shell's handleToggleComplete, the
   *  wall's single task-completion path. Explicit direction, never a toggle. */
  onToggleTask: (taskId: string, completed: boolean) => void
  onClose: () => void
}

function dueText(row: KidHomeworkRow): string | null {
  if (!row.due) return null
  if (row.late) return 'Late'
  return row.due === 'Today' ? 'Due today' : `Due ${row.due}`
}

function noticeMeta(n: KidNoticeRow): string {
  const date = n.receivedOn.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return n.senderLabel ? `${n.senderLabel} · ${date}` : date
}

function targetText(amount: number, unit: 'minutes' | 'count', progress: number): string {
  return unit === 'minutes' ? `${progress} of ${amount} min` : `${progress} of ${amount}`
}

/** doneOverlay key for a row — namespaced by entityType so a task and a
 *  routine that happen to share a raw uuid can't clobber each other's
 *  optimistic state. */
function overlayKey(row: KidRow): string {
  return `${row.entityType}:${row.id}`
}

/** A needed-on row wears the plain task-row shape, so it completes through the
 *  same handler (and the same optimistic overlay) as an assigned task. */
function neededToRow(needed: KidNeededRow): KidRow {
  return { entityType: 'task', id: needed.id, title: needed.title, done: false, timeOfDay: null, target: null }
}

export function KidDayView({ member, routines, todayItems, neededTasks, homeworkTasks, notices, onToggleTask, onClose }: KidDayViewProps) {
  const { markDone, undoDone, addProgress, setProgress } = useActionableInstances()
  const { history } = useMemberInstanceHistory()

  // Optimistic overlays: applied over the model's derived state, so a tap
  // reads instantly instead of waiting on the write + refetch. doneOverlay
  // covers both plain routine rows and task rows (keyed by entityType:id so
  // the two entity kinds can't collide on the same raw uuid). Cleared
  // whenever history refreshes (routine writes) or todayItems gets a new
  // identity (the Shell's post-toggle refetch — the task write's signal).
  const [progressOverlay, setProgressOverlay] = useState<Map<string, number>>(new Map())
  const [doneOverlay, setDoneOverlay] = useState<Map<string, boolean>>(new Map())
  useEffect(() => {
    setProgressOverlay(new Map())
    setDoneOverlay(new Map())
  }, [history, todayItems, neededTasks, homeworkTasks])

  // Which target rows are expanded, and whether they're in "Exact…" mode.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exactMode, setExactMode] = useState<Set<string>>(new Set())
  const [exactValue, setExactValue] = useState<Record<string, string>>({})

  const model: MemberDayModel = useMemo(() => {
    // One clock read for both arguments: the day being rendered IS today on
    // the kiosk, and `now` is what the evening "needed tomorrow" rule reads.
    const clock = new Date()
    return buildMemberDayModel({ member, date: clock, now: clock, routines, todayItems, neededTasks, homeworkTasks, notices, history })
  }, [member, routines, todayItems, neededTasks, homeworkTasks, notices, history])

  const resetIdleTimer = useIdleClose(onClose)

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setExactMode((em) => {
          if (!em.has(id)) return em
          const n = new Set(em)
          n.delete(id)
          return n
        })
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handlePlainRoutineTap = useCallback((row: KidRow) => {
    const key = overlayKey(row)
    const current = doneOverlay.has(key) ? doneOverlay.get(key)! : row.done
    const next = !current
    setDoneOverlay((prev) => new Map(prev).set(key, next))
    if (next) void markDone('routine', row.id, new Date())
    else void undoDone('routine', row.id, new Date())
  }, [doneOverlay, markDone, undoDone])

  const handleTaskTap = useCallback((row: KidRow) => {
    const key = overlayKey(row)
    const current = doneOverlay.has(key) ? doneOverlay.get(key)! : row.done
    const next = !current
    setDoneOverlay((prev) => new Map(prev).set(key, next))
    onToggleTask(`task-${row.id}`, next)
  }, [doneOverlay, onToggleTask])

  const handleChipAdd = useCallback((row: KidRow, amount: number) => {
    if (!row.target) return
    const current = progressOverlay.has(row.id) ? progressOverlay.get(row.id)! : row.target.progress
    setProgressOverlay((prev) => new Map(prev).set(row.id, current + amount))
    void addProgress('routine', row.id, new Date(), amount, row.target.amount)
  }, [progressOverlay, addProgress])

  const handleExactChip = useCallback((row: KidRow) => {
    setExactMode((prev) => new Set(prev).add(row.id))
    const current = progressOverlay.has(row.id) ? progressOverlay.get(row.id)! : row.target?.progress ?? 0
    setExactValue((prev) => ({ ...prev, [row.id]: String(current) }))
  }, [progressOverlay])

  const handleExactSet = useCallback((row: KidRow) => {
    if (!row.target) return
    const value = Number(exactValue[row.id])
    if (!Number.isFinite(value)) return
    setProgressOverlay((prev) => new Map(prev).set(row.id, value))
    void setProgress('routine', row.id, new Date(), value, row.target.amount)
    setExactMode((prev) => {
      const n = new Set(prev)
      n.delete(row.id)
      return n
    })
  }, [exactValue, setProgress])

  function displayRow(row: KidRow): KidRow {
    if (row.target) {
      const progress = progressOverlay.has(row.id) ? progressOverlay.get(row.id)! : row.target.progress
      return { ...row, target: { ...row.target, progress } }
    }
    const key = overlayKey(row)
    const done = doneOverlay.has(key) ? doneOverlay.get(key)! : row.done
    return { ...row, done }
  }

  function renderRow(rawRow: KidRow) {
    const row = displayRow(rawRow)
    if (row.target) {
      const chips = row.target.unit === 'minutes' ? MINUTE_CHIPS : COUNT_CHIPS
      const isExpanded = expanded.has(row.id)
      const isExact = exactMode.has(row.id)
      return (
        <div key={row.id} className={`${WALL.cardInset} min-h-[56px]`}>
          <button
            type="button"
            onClick={() => toggleExpand(row.id)}
            className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <div className={`text-[1.05rem] font-semibold ${WALL.inkStrong}`}>{row.title}</div>
              <div className={`text-[0.9rem] ${WALL.muted}`}>
                {targetText(row.target.amount, row.target.unit, row.target.progress)}
              </div>
              {row.target.streak >= 2 && (
                <div className={`flex items-center gap-1 text-[0.85rem] font-semibold ${WALL.warn}`}>
                  <Flame className="w-4 h-4" aria-hidden="true" />
                  {row.target.streak} days in a row
                </div>
              )}
            </div>
            <ProgressRing amount={row.target.amount} progress={row.target.progress} />
          </button>
          {isExpanded && (
            <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
              {!isExact && chips.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => handleChipAdd(row, amount)}
                  className={`${WALL.card} px-4 h-14 font-bold text-[1rem]`}
                >
                  +{amount}
                </button>
              ))}
              {!isExact && (
                <button
                  type="button"
                  onClick={() => handleExactChip(row)}
                  className={`${WALL.card} px-4 h-14 font-bold text-[1rem]`}
                >
                  Exact…
                </button>
              )}
              {isExact && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={exactValue[row.id] ?? ''}
                    onChange={(e) => setExactValue((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    className={`${WALL.card} h-14 w-24 px-3 text-[1rem] font-bold text-center`}
                  />
                  <button
                    type="button"
                    onClick={() => handleExactSet(row)}
                    className={`${WALL.card} px-5 h-14 font-bold text-[1rem]`}
                  >
                    Set
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    const onTap = row.entityType === 'task' ? () => handleTaskTap(row) : () => handlePlainRoutineTap(row)
    return (
      <button
        key={row.id}
        type="button"
        onClick={onTap}
        className={`${WALL.cardInset} w-full min-h-[56px] flex items-center gap-3 px-4 py-3 text-left`}
      >
        <span
          aria-hidden="true"
          className={`shrink-0 w-6 h-6 rounded-full border-2 ${
            row.done ? 'bg-[#2E4638] border-[#2E4638] dark:bg-[#6DC4A7] dark:border-[#6DC4A7]' : 'border-[#8A7D68]'
          }`}
        />
        <span className={`text-[1.05rem] font-semibold ${row.done ? WALL.muted + ' line-through' : WALL.inkStrong}`}>
          {row.title}
        </span>
      </button>
    )
  }

  // The Homework card. Two tap targets per row: the checkbox (the existing
  // task path — overlay, then onToggleTask with the one `task-` prefix) and
  // the title, which opens the item's notes when it has any. Expanded state
  // is namespaced `homework:` so it can't collide with a target routine id.
  function renderHomeworkRow(row: KidHomeworkRow) {
    const key = `task:${row.id}`
    const done = doneOverlay.has(key) ? doneOverlay.get(key)! : false
    const open = expanded.has(`homework:${row.id}`)
    const due = dueText(row)
    return (
      <div key={row.id} className={`${WALL.cardInset} flex flex-col`}>
        <div className="flex items-stretch">
          <button
            type="button"
            aria-label={`Mark ${row.title} ${done ? 'not done' : 'done'}`}
            onClick={() => handleTaskTap({ entityType: 'task', id: row.id, title: row.title, done, timeOfDay: null, target: null })}
            className="shrink-0 min-h-[56px] w-16 grid place-items-center"
          >
            <span
              aria-hidden="true"
              className={`w-6 h-6 rounded-full border-2 ${
                done ? 'bg-[#2E4638] border-[#2E4638] dark:bg-[#6DC4A7] dark:border-[#6DC4A7]' : 'border-[#8A7D68]'
              }`}
            />
          </button>
          <button
            type="button"
            aria-label={row.title}
            disabled={!row.notes}
            onClick={() => toggleExpand(`homework:${row.id}`)}
            className="flex-1 min-w-0 py-3 pr-4 text-left"
          >
            <div className={`text-[1.05rem] font-semibold ${done ? WALL.muted + ' line-through' : WALL.inkStrong}`}>{row.title}</div>
            {due && <div className={`text-[0.9rem] font-semibold ${row.late ? WALL.warn : WALL.muted}`}>{due}</div>}
          </button>
        </div>
        {open && row.notes && (
          <div className={`px-4 pb-4 pl-16 text-[0.95rem] whitespace-pre-line ${WALL.muted}`}>{row.notes}</div>
        )}
      </div>
    )
  }

  const homeworkCard = model.homework.length > 0 && (
    <div className={`${WALL.card} p-5 flex flex-col gap-3`}>
      <div className={`flex items-center gap-2 text-[1.15rem] font-bold ${WALL.inkStrong}`}>
        <BookOpen className="w-5 h-5" aria-hidden="true" />
        Homework
      </div>
      <div className="flex flex-col gap-2">{model.homework.map(renderHomeworkRow)}</div>
    </div>
  )

  // Information, not work: rendered whether or not the page has a list, and
  // read-only — a notice ages out by query after 14 days.
  const noticesCard = model.notices.length > 0 && (
    <div className={`${WALL.card} p-5 flex flex-col gap-3`}>
      <div className={`flex items-center gap-2 text-[1.15rem] font-bold ${WALL.inkStrong}`}>
        <Mail className="w-5 h-5" aria-hidden="true" />
        From school
      </div>
      <div className="flex flex-col gap-2">
        {model.notices.map((n) => (
          <div key={n.id} className={`${WALL.cardInset} px-4 py-3`}>
            <div className={`text-[1.05rem] font-semibold ${WALL.inkStrong}`}>{n.text}</div>
            <div className={`text-[0.85rem] ${WALL.muted}`}>{noticeMeta(n)}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' })

  return (
    <div
      className={`absolute inset-0 z-50 overflow-y-auto ${WALL.root}`}
      onPointerDownCapture={resetIdleTimer}
    >
      <div className="flex items-center gap-4 px-8 pt-8 pb-4">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className={`${WALL.card} grid place-items-center w-14 h-14 shrink-0`}
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className={`font-display text-[2rem] font-bold leading-tight ${WALL.inkStrong}`}>{member.name}</h1>
          <div className={WALL.label}>{weekday}</div>
        </div>
      </div>

      <div className="px-8 pb-12 flex flex-col gap-6">
        {model.isEmpty ? (
          <div className="flex items-center justify-center py-24">
            <p className={`text-[1.3rem] font-semibold ${WALL.muted}`}>Nothing on your list — go play.</p>
          </div>
        ) : (
          <>
            {homeworkCard}

            {model.needed.length > 0 && (
              <div className={`${WALL.card} p-5 flex flex-col gap-3`}>
                <div className={`text-[1.15rem] font-bold ${WALL.inkStrong}`}>Needed today</div>
                {model.needed.some((n) => !n.tomorrow) && (
                  <div className="flex flex-col gap-2">
                    {model.needed.filter((n) => !n.tomorrow).map((n) => renderRow(neededToRow(n)))}
                  </div>
                )}
                {model.needed.some((n) => n.tomorrow) && (
                  <>
                    <div className={WALL.label}>Tomorrow</div>
                    <div className="flex flex-col gap-2">
                      {model.needed.filter((n) => n.tomorrow).map((n) => renderRow(neededToRow(n)))}
                    </div>
                  </>
                )}
              </div>
            )}

            {model.collections.map((collection) => (
              <div key={collection.id} className={`${WALL.card} p-5 flex flex-col gap-3`}>
                <div className={`text-[1.15rem] font-bold ${WALL.inkStrong}`}>{collection.title}</div>
                <div className="flex flex-col gap-2">
                  {collection.rows.map((row) => renderRow(row))}
                </div>
              </div>
            ))}

            {BAND_ORDER.filter((band) => model.bands[band].length > 0).map((band) => (
              <div key={band} className="flex flex-col gap-2">
                <div className={WALL.label}>{BAND_LABELS[band]}</div>
                {model.bands[band].map((row) => renderRow(row))}
              </div>
            ))}
          </>
        )}

        {noticesCard}
      </div>
    </div>
  )
}

/** Idle auto-close: resets on any pointerdown inside the container (capture
 *  phase, wired via onPointerDownCapture on the root). */
function useIdleClose(onClose: () => void): () => void {
  const [timerVersion, setTimerVersion] = useState(0)
  useEffect(() => {
    const timer = setTimeout(onClose, KID_VIEW_IDLE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, timerVersion])
  return useCallback(() => setTimerVersion((v) => v + 1), [])
}

function ProgressRing({ amount, progress }: { amount: number; progress: number }) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const fraction = amount > 0 ? Math.min(1, Math.max(0, progress / amount)) : 0
  const offset = circumference * (1 - fraction)
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0" aria-hidden="true">
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-[#E5DAC5] dark:stroke-[#3E362A]" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 24 24)"
        className="stroke-[#2E4638] dark:stroke-[#6DC4A7]"
      />
    </svg>
  )
}
