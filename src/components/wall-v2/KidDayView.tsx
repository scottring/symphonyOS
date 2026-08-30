// Full-screen per-member day page for the wall kiosk: "what does MY day look
// like." Same overlay layer as WallRecipeViewer. Collections render first as
// titled cards, then standalone routines/tasks band by time of day. A target
// routine (read >= 20 min) shows progress + a streak line and expands to log
// more; a plain routine or an assigned task is a straight checkbox tap.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Flame } from 'lucide-react'
import { WALL } from './wallTheme'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useMemberInstanceHistory } from './useMemberInstanceHistory'
import { buildMemberDayModel } from '@/lib/wall/kidDayModel'
import type { KidRow, KidBandKey, MemberDayModel } from '@/lib/wall/kidDayModel'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
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
  /** Complete/uncomplete a TASK row — the Shell's handleToggleComplete, the
   *  wall's single task-completion path. Explicit direction, never a toggle. */
  onToggleTask: (taskId: string, completed: boolean) => void
  onClose: () => void
}

function targetText(amount: number, unit: 'minutes' | 'count', progress: number): string {
  return unit === 'minutes' ? `${progress} of ${amount} min` : `${progress} of ${amount}`
}

export function KidDayView({ member, routines, todayItems, onToggleTask, onClose }: KidDayViewProps) {
  const { markDone, undoDone, addProgress, setProgress } = useActionableInstances()
  const { history } = useMemberInstanceHistory()

  // Optimistic overlays: applied over the model's derived state, so a tap
  // reads instantly instead of waiting on the write + history refresh.
  // Cleared whenever history refreshes (a new array from the fetch).
  const [progressOverlay, setProgressOverlay] = useState<Map<string, number>>(new Map())
  const [doneOverlay, setDoneOverlay] = useState<Map<string, boolean>>(new Map())
  useEffect(() => {
    setProgressOverlay(new Map())
    setDoneOverlay(new Map())
  }, [history])

  // Which target rows are expanded, and whether they're in "Exact…" mode.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exactMode, setExactMode] = useState<Set<string>>(new Set())
  const [exactValue, setExactValue] = useState<Record<string, string>>({})

  const model: MemberDayModel = useMemo(
    () => buildMemberDayModel({ member, date: new Date(), routines, todayItems, history }),
    [member, routines, todayItems, history],
  )

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
    const current = doneOverlay.has(row.id) ? doneOverlay.get(row.id)! : row.done
    const next = !current
    setDoneOverlay((prev) => new Map(prev).set(row.id, next))
    if (next) void markDone('routine', row.id, new Date())
    else void undoDone('routine', row.id, new Date())
  }, [doneOverlay, markDone, undoDone])

  const handleTaskTap = useCallback((row: KidRow) => {
    onToggleTask(`task-${row.id}`, !row.done)
  }, [onToggleTask])

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
    const done = doneOverlay.has(row.id) ? doneOverlay.get(row.id)! : row.done
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
