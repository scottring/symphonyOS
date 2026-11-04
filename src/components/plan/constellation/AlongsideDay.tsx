// src/components/plan/constellation/AlongsideDay.tsx
//
// The connected workspace's day with its week beside it. The week is the
// shared compact list (canvas/week, 2026-10-10) that Today's classic column
// draws too; this file keeps its own data (the week's actions through the
// page's layer and people filters) and its own writer (lineDropUpdates
// through `update`), reporting each placement through the canvas activity
// strip with an Undo that puts the fields back. The rows are flat, with no
// parent (paper-style horizons, 2026-11-04), as on Week and Today.
//
// Paper-style horizons (Scott, 2026-11-04: "add today with the + on the week
// sheet"): the week no longer stands in a This week column with its own
// show/hide. It lies folded beside the day like every horizon's level above
// (PaperFold horizon="day"), and the one exception to "no controls on the
// sheet above" holds: each row keeps its + and its drag onto the day.
//
// What was given an earlier day of this week and is still open comes back
// first, marked faintly with its day ("Tue"); + plans it for the day (Task 4,
// Scott 2026-11-04: yesterday's unfinished tasks go back where they came
// from). The same selector as Today's own sheet (earlierThisWeek).
import { useCallback, useRef, useState, useMemo, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { weekListTasks, earlierThisWeek, earlierDayMark } from '@/lib/planning/weekList'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { dayWordFor } from '@/components/canvas/week/compactWeek'
import { placedInWeek } from '@/components/canvas/week/weekShelf'
import { PaperFold } from '@/components/plan/fold/PaperFold'
import { AboveSheet } from '@/components/plan/fold/AboveSheet'
import { TODAY_WEEK_FOOT } from '@/components/schedule/TodayWeekColumn'
import { AlongsideContext, type AlongsideWorkspace } from './AlongsideContext'
import { writePlanDrag } from '@/lib/planning/planDrag'
import './alongside.css'

const WEEK_ACTION_MIME = 'application/x-symphony-week-action'

export function AlongsideDay({ children, tasks, date, update, loading, error, weekView = false, onSelect, stepAside = false }: {
  children: ReactNode
  /** The old Review today link (?review=1) is on its way to ?plan=1: the
   *  week steps aside for that moment. A Day session itself keeps the week
   *  beside the day (planning as tooltips, 2026-11-04). The shell stays, so
   *  the day under it is never remounted (walk, 2026-11-01). */
  stepAside?: boolean
  tasks: Task[]
  date: Date
  update: (id: string, patch: Partial<Task>) => Promise<boolean | void>
  /** Toggles a task's done state. The week sheet carries no check (the sheet
   *  above has no controls but its +), so it is unused here. */
  complete?: (id: string) => Promise<boolean | void>
  loading: boolean
  error: boolean
  /** Reloads the tasks. The day page offers its own Try again. */
  retry: () => void
  weekView?: boolean
  onSelect?: (id: string) => void
}) {
  const { layers } = useDomain(), [people] = useAssigneeFilter(), { getCurrentUserMember } = useFamilyMembers()
  const activity = useCanvasActivity()
  const [pending, setPending] = useState<string | null>(null), [message, setMessage] = useState('')
  // Where Today draws "Routines {day}" on this sheet (TodayView holds the
  // day's plan and its writers; fix round 2, 2026-11-04).
  const [routinesSlot, setRoutinesSlot] = useState<HTMLElement | null>(null)
  // Today drives the week open for the guide's Today step (PaperFold `drive`).
  const [weekDrive, setWeekDrive] = useState<boolean | undefined>(undefined)
  // Today hears each placement that saved (the Day session's Pick step).
  const placedListeners = useRef(new Set<() => void>())
  const listenPlaced = useCallback((listener: () => void) => {
    placedListeners.current.add(listener)
    return () => { placedListeners.current.delete(listener) }
  }, [])
  const workspace = useMemo<AlongsideWorkspace | null>(() => weekView ? null : { weekFolded: true, routinesSlot, driveWeek: setWeekDrive, listenPlaced }, [weekView, routinesSlot, listenPlaced])
  const lock = useRef(false)
  const wso = readCadenceConfig().weekStartsOn
  const week = weekStartAnchor(date, wso)
  const lens = planPeopleLens(people, getCurrentUserMember()?.id ?? null)
  const visible = filterTasksForLayers(tasks, layers).filter(lens.keep)
  const weekTasks = weekListTasks(visible, week, lens.scopeId, { isCurrent: localYmd(week) === localYmd(weekStartAnchor(new Date(), wso)) })
  const ymd = localYmd(date)
  const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const { word: dayWord } = dayWordFor(date)

  // The week's open work with no day yet, as the Week page's "No day yet"
  // reads it: not done, not on this day, not on another day of the week.
  // Earlier this week's first, each once.
  const now = new Date()
  const earlier = earlierThisWeek(visible, { weekStart: week, day: date, scopeId: lens.scopeId })
  const earlierIds = new Set(earlier.map((t) => t.id))
  const open = [...earlier, ...weekTasks.filter((t) => !t.completed && !earlierIds.has(t.id)
    && !(t.scheduledFor && localYmd(t.scheduledFor) === ymd)
    && !placedInWeek(t, week, now))]
  const doneCount = weekTasks.filter((t) => t.completed).length

  const place = async (id: string) => {
    const task = [...earlier, ...weekTasks].find((t) => t.id === id && !t.completed)
    if (!task || lock.current) return
    lock.current = true; setPending(id); setMessage('')
    const patch = lineDropUpdates(task, { kind: 'day', at: date })
    // Undo writes back exactly the fields the placement wrote.
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, task[k as keyof Task]])) as Partial<Task>
    try {
      const ok = await activity.run(`Plan “${task.title}” for ${dayLabel}`, () => update(id, patch), {
        ids: [id], undo: () => update(id, prev), retry: () => { void place(id) },
      })
      setMessage(ok ? `Planned “${task.title}” for ${dayLabel}.` : 'Could not place this action. It remains available; try again.')
      if (ok) placedListeners.current.forEach((l) => l())
    } finally { lock.current = false; setPending(null) }
  }

  const range = formatWeekRangeShort(week)
  // A week row dropped on the day's hours gets the time it lands at: the
  // row carries the plan-drag payload too, and the grid (TodayDayScale) takes
  // that drop and stops it there (Scott, 2026-11-04: "drag directly from the
  // week strip to the calendar grid"). Dropped anywhere else on the day it
  // bubbles here and is placed for the day with no time, the same as +.
  const day = (
    <div className="ad-day"
      onDragOver={(e) => { if (e.dataTransfer.types.includes(WEEK_ACTION_MIME)) e.preventDefault() }}
      onDrop={stepAside ? undefined : (e) => { const id = e.dataTransfer.getData(WEEK_ACTION_MIME); if (id) { e.preventDefault(); e.stopPropagation(); void place(id) } }}>
      {children}
    </div>
  )
  return (
    <AlongsideContext.Provider value={workspace}>
      <section className="ad-shell">
        <p role="status" className="ad-status">{message}</p>
        {weekView ? day : (
          // A session stows the fold rather than unmounting it, so the day
          // under it keeps its state.
          <PaperFold horizon="day" className="today-fold ad-fold" stowed={stepAside} edgeLabel={range} edgeCount={open.length}
            drive={weekDrive === undefined ? undefined : { above: weekDrive }}
            frontLabel={`${range}, to pick from`}
            above={<AboveSheet kicker="Week" title={range}
              rows={open.map((t, i) => earlierIds.has(t.id)
                ? { id: t.id, title: t.title, mark: earlierDayMark(t), anchor: i === 0 ? 'leftovers' : undefined }
                : { id: t.id, title: t.title })} doneCount={doneCount} foot={TODAY_WEEK_FOOT}
              empty={loading ? 'Loading this week’s tasks…' : error ? 'This week didn’t load.' : 'Nothing still to place this week.'}
              onPick={(id) => { if (!pending) void place(id) }} pickLabel={(title) => `Plan ${title} for ${dayWord}`}
              onOpen={onSelect} onDragRow={(id, ev) => {
                const t = open.find((x) => x.id === id)
                // The plan payload is what the day's hours read (TodayView's
                // own sheet writes the same); ours places it anywhere else.
                if (t) writePlanDrag(ev.dataTransfer, { kind: 'task', id, date: ymd, title: t.title })
                ev.dataTransfer.setData(WEEK_ACTION_MIME, id); ev.dataTransfer.effectAllowed = 'move'
              }}>
              <div ref={setRoutinesSlot} className="ad-routines" />
            </AboveSheet>}>
            {day}
          </PaperFold>
        )}
      </section>
    </AlongsideContext.Provider>
  )
}
