// Full-screen per-member day page for the wall kiosk: "what does MY day look
// like." Same overlay layer as WallRecipeViewer. Two columns at 1024×768:
// the LIST on the left (homework, needed today, collections, routines by
// band) and the DAY on the right (reading and what it earned, today at
// school, notes from school). A target routine (read ≥ 20 min) is the page's
// own card with a timer; a plain routine or an assigned task is a checkbox.
//
// The Pi's touch arrives as mouse events, so the page scrolls by drag
// (useDragScroll) — native touch scrolling never fires there.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Flame, GraduationCap, Mail, Play, Square, Tv, Umbrella } from 'lucide-react'
import { WALL } from './wallTheme'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useMemberInstanceHistory } from './useMemberInstanceHistory'
import { useReadingScreenTime } from './useReadingScreenTime'
import { useDragScroll } from '@/hooks/useDragScroll'
import { buildMemberDayModel } from '@/lib/wall/kidDayModel'
import type { KidRow, KidNeededRow, KidHomeworkRow, KidNoticeRow, KidBandKey, MemberDayModel } from '@/lib/wall/kidDayModel'
import {
  READING_REASON, readingEarns, readingTimerKey, readReadingTimer, writeReadingTimer,
  elapsedLabel, minutesToLog, type ReadingTimer,
} from '@/lib/wall/readingScreenTime'
import { whatToWear } from '@/lib/wall/whatToWear'
import { localYmd } from '@/lib/cadence/config'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'
import type { WallNotice } from '@/hooks/useWallData'
import type { ChildScreenTimeSummary } from '@/hooks/useScreenTime'
import type { WeatherData } from '@/hooks/useWeather'
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
  /** Tomorrow's items — the evening "tomorrow's special" line. */
  tomorrowItems?: Record<DaySection, TimelineItem[]>
  /** The household roster, to name who is on a pickup. */
  members?: FamilyMember[]
  /** Incomplete tasks carrying `needed_on`, from useWallData's narrow query.
   *  They have no `scheduled_for`, so they are absent from `todayItems`. */
  neededTasks: Task[]
  /** Open homework, any date, from useWallData's own query. The Homework
   *  card owns these rows; the model keeps them out of needed/bands. */
  homeworkTasks: Task[]
  /** Standing info from school, last 14 days. */
  notices: WallNotice[]
  /** Today's screen-time ledger for this member, from useWallData. */
  screenTime?: ChildScreenTimeSummary | null
  weather?: WeatherData | null
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

const storage = (): Storage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function KidDayView({
  member, routines, todayItems, tomorrowItems, members, neededTasks, homeworkTasks, notices, screenTime, weather, onToggleTask, onClose,
}: KidDayViewProps) {
  const { markDone, undoDone, addProgress, setProgress } = useActionableInstances()
  const { history } = useMemberInstanceHistory()
  const { syncEarned } = useReadingScreenTime()
  const scrollRef = useDragScroll<HTMLDivElement>()

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
    return buildMemberDayModel({
      member, date: clock, now: clock, routines, todayItems, tomorrowItems, members, neededTasks, homeworkTasks, notices, history,
    })
  }, [member, routines, todayItems, tomorrowItems, members, neededTasks, homeworkTasks, notices, history])

  const resetIdleTimer = useIdleClose(onClose)

  // ── The reading timer ─────────────────────────────────────────────
  const ymd = localYmd(new Date())
  const timerKey = readingTimerKey(member.id, ymd)
  const [timer, setTimer] = useState<ReadingTimer | null>(() => readReadingTimer(storage(), timerKey))
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    if (!timer) return
    const id = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(id)
  }, [timer])

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

  /** Reading progress also moves the screen-time ledger. Same day, one row. */
  const afterReadingChange = useCallback((row: KidRow, nextProgress: number) => {
    if (!model.reading || row.id !== model.reading.id || !row.target) return
    void syncEarned(member.id, ymd, readingEarns(nextProgress, row.target.amount))
  }, [model.reading, syncEarned, member.id, ymd])

  const handleChipAdd = useCallback((row: KidRow, amount: number) => {
    if (!row.target) return
    const current = progressOverlay.has(row.id) ? progressOverlay.get(row.id)! : row.target.progress
    const next = current + amount
    setProgressOverlay((prev) => new Map(prev).set(row.id, next))
    void addProgress('routine', row.id, new Date(), amount, row.target.amount)
    afterReadingChange(row, next)
  }, [progressOverlay, addProgress, afterReadingChange])

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
    afterReadingChange(row, value)
    setExactMode((prev) => {
      const n = new Set(prev)
      n.delete(row.id)
      return n
    })
  }, [exactValue, setProgress, afterReadingChange])

  const handleTimerStart = useCallback(() => {
    const t = { startedAt: new Date().toISOString() }
    writeReadingTimer(storage(), timerKey, t)
    setTimer(t)
    setTick(new Date())
  }, [timerKey])

  const handleTimerStop = useCallback((row: KidRow) => {
    if (!timer) return
    const minutes = minutesToLog(timer, new Date())
    writeReadingTimer(storage(), timerKey, null)
    setTimer(null)
    if (minutes > 0) handleChipAdd(row, minutes)
  }, [timer, timerKey, handleChipAdd])

  function displayRow(row: KidRow): KidRow {
    if (row.target) {
      const progress = progressOverlay.has(row.id) ? progressOverlay.get(row.id)! : row.target.progress
      return { ...row, target: { ...row.target, progress } }
    }
    const key = overlayKey(row)
    const done = doneOverlay.has(key) ? doneOverlay.get(key)! : row.done
    return { ...row, done }
  }

  function renderChips(row: KidRow) {
    if (!row.target) return null
    const chips = row.target.unit === 'minutes' ? MINUTE_CHIPS : COUNT_CHIPS
    const isExact = exactMode.has(row.id)
    return (
      <div className="flex flex-wrap items-center gap-2">
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
    )
  }

  function renderRow(rawRow: KidRow) {
    const row = displayRow(rawRow)
    if (row.target) {
      const isExpanded = expanded.has(row.id)
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
          {isExpanded && <div className="px-4 pb-4">{renderChips(row)}</div>}
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

  // ── Reading + what it earned ──────────────────────────────────────
  const reading = model.reading ? displayRow(model.reading) : null
  const readingEarned = reading?.target ? readingEarns(reading.target.progress, reading.target.amount) : 0
  // The ledger's own Reading line is replaced by the live number, so a chip
  // tap reads instantly and never double-counts once the write lands.
  const ledgerReading = screenTime?.adjustments.find((a) => a.reason === READING_REASON)?.minutes ?? 0
  const screenMinutes = Math.max(0, (screenTime?.effectiveBudget ?? 0) - ledgerReading + readingEarned)

  const readingCard = reading && reading.target && (
    <div className={`${WALL.card} p-5 flex flex-col gap-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`flex items-center gap-2 text-[1.15rem] font-bold ${WALL.inkStrong}`}>
            <BookOpen className="w-5 h-5" aria-hidden="true" />
            Reading
          </div>
          <div className={`font-display text-[2rem] leading-none mt-1 ${WALL.inkStrong}`}>
            {reading.target.progress}
            <span className={`text-[1.1rem] font-sans font-semibold ${WALL.muted}`}> of {reading.target.amount} min</span>
          </div>
          {reading.target.streak >= 2 && (
            <div className={`flex items-center gap-1 mt-1 text-[0.9rem] font-semibold ${WALL.warn}`}>
              <Flame className="w-4 h-4" aria-hidden="true" />
              {reading.target.streak} days in a row
            </div>
          )}
        </div>
        <ProgressRing amount={reading.target.amount} progress={reading.target.progress} size={72} />
      </div>

      {timer ? (
        <button
          type="button"
          onClick={() => handleTimerStop(reading)}
          aria-label="Stop reading"
          className="min-h-[72px] rounded-xl flex items-center justify-between px-5 bg-[#2E4638] dark:bg-[#4E7261] text-white active:scale-[.98] transition-transform"
        >
          <span className="text-[1.1rem] font-bold">Reading…</span>
          <span className="font-display text-[2rem] tabular-nums">{elapsedLabel(timer, tick)}</span>
          <span className="flex items-center gap-2 text-[1.05rem] font-bold"><Square className="w-5 h-5 fill-current" aria-hidden="true" />Stop</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleTimerStart}
          aria-label="Start reading"
          className="min-h-[72px] rounded-xl flex items-center justify-center gap-3 bg-[#2E4638] dark:bg-[#4E7261] text-white text-[1.25rem] font-bold active:scale-[.98] transition-transform"
        >
          <Play className="w-6 h-6 fill-current" aria-hidden="true" />
          Start reading
        </button>
      )}

      {renderChips(reading)}
    </div>
  )

  const screenCard = reading && (
    <div className={`${WALL.dinnerCard} p-5 flex items-center gap-4`}>
      <Tv className="w-9 h-9 shrink-0 text-[#A8743F] dark:text-[#D8BC85]" aria-hidden="true" />
      <div className="min-w-0">
        <div className={WALL.dinnerLabel}>Screen time today</div>
        <div className={`font-display text-[2rem] leading-none ${WALL.inkStrong}`}>
          {screenMinutes}<span className={`text-[1.1rem] font-sans font-semibold ${WALL.muted}`}> min</span>
        </div>
        <div className={`text-[0.9rem] font-semibold ${WALL.muted}`}>
          A minute read is a minute earned, up to {reading.target?.amount ?? 20}.
        </div>
      </div>
    </div>
  )

  const school = model.school
  const schoolCard = school && (
    <div className={`${WALL.card} p-5 flex flex-col gap-3`}>
      <div className={`flex items-center gap-2 text-[1.15rem] font-bold ${WALL.inkStrong}`}>
        <GraduationCap className="w-5 h-5" aria-hidden="true" />
        Today at school
      </div>
      {school.special && (
        <div>
          <div className={WALL.label}>Special</div>
          <div className={`font-display text-[1.7rem] leading-tight ${WALL.inkStrong}`}>{school.special}</div>
          {school.hint && <div className={`text-[1rem] font-semibold ${WALL.muted}`}>{school.hint}</div>}
        </div>
      )}
      {school.pickup && (
        <div>
          <div className={WALL.label}>Pickup</div>
          <div className={`text-[1.2rem] font-bold ${school.pickup.who ? WALL.inkStrong : WALL.warn}`}>
            {school.pickup.time} · {school.pickup.who ?? 'not decided yet'}
          </div>
        </div>
      )}
      {school.tomorrowSpecial && (
        <div>
          <div className={WALL.label}>Tomorrow</div>
          <div className={`text-[1.2rem] font-bold ${WALL.inkStrong}`}>{school.tomorrowSpecial}</div>
        </div>
      )}
    </div>
  )

  const wear = useMemo(() => whatToWear(weather, new Date()), [weather])
  const weekday = new Date().toLocaleDateString(undefined, { weekday: 'long' })

  const list = (
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
  )

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col ${WALL.root}`}
      onPointerDownCapture={resetIdleTimer}
    >
      <div className="flex items-center gap-4 px-8 pt-6 pb-3 shrink-0">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className={`${WALL.card} grid place-items-center w-14 h-14 shrink-0`}
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <h1 className={`font-display text-[2rem] font-bold leading-tight ${WALL.inkStrong}`}>{member.name}</h1>
          <div className={WALL.label}>{weekday}</div>
        </div>
        {wear && (
          <div className={`ml-auto ${WALL.cardInset} flex items-center gap-3 px-4 py-2`}>
            <Umbrella className={`w-6 h-6 shrink-0 ${WALL.muted}`} aria-hidden="true" />
            <div>
              <div className={`text-[1.05rem] font-bold ${WALL.inkStrong}`}>{wear.wear}</div>
              <div className={`text-[0.85rem] font-semibold ${WALL.muted}`}>{wear.why}</div>
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 pb-10">
        <div className="grid grid-cols-[3fr_2fr] gap-4 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {model.isEmpty ? (
              <div className={`${WALL.card} flex items-center justify-center py-16`}>
                <p className={`text-[1.3rem] font-semibold ${WALL.muted}`}>Nothing on your list — go play.</p>
              </div>
            ) : list}
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            {readingCard}
            {screenCard}
            {schoolCard}
            {noticesCard}
          </div>
        </div>
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

function ProgressRing({ amount, progress, size = 48 }: { amount: number; progress: number; size?: number }) {
  const radius = size * (20 / 48)
  const c = size / 2
  const circumference = 2 * Math.PI * radius
  const fraction = amount > 0 ? Math.min(1, Math.max(0, progress / amount)) : 0
  const offset = circumference * (1 - fraction)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={c} cy={c} r={radius} fill="none" strokeWidth={size / 9.6} className="stroke-[#E5DAC5] dark:stroke-[#3E362A]" />
      <circle
        cx={c}
        cy={c}
        r={radius}
        fill="none"
        strokeWidth={size / 9.6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${c} ${c})`}
        className="stroke-[#2E4638] dark:stroke-[#6DC4A7]"
      />
    </svg>
  )
}
