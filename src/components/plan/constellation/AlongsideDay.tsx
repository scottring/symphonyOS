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
import { stepsInstead } from '@/lib/planning/weekSteps'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { openSteps, sheetRowStatus, stepWrites, type StepSavers } from '@/lib/planning/sheetStatus'
import { compareSortOrder, reorderTasksToIndex } from '@/lib/today/taskOrdering'
import { formatWeekRangeShort } from '@/lib/dateHelpers'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { dayWordFor } from '@/components/canvas/week/compactWeek'
import { placedInWeek } from '@/components/canvas/week/weekShelf'
import { PaperFold } from '@/components/plan/fold/PaperFold'
import { AboveSheet, SheetRows, type RowStatusMenu } from '@/components/plan/fold/AboveSheet'
import { TODAY_WEEK_FOOT, TODAY_WEEK_SHORT_LIST, SheetTaskTools } from '@/components/schedule/TodayWeekColumn'
import { AlongsideContext, type AlongsideWorkspace } from './AlongsideContext'
import './alongside.css'

const WEEK_ACTION_MIME = 'application/x-symphony-week-action'

export function AlongsideDay({ children, tasks, date, update, complete, addStep, removeStep, loading, error, weekView = false, onSelect, stepAside = false }: {
  children: ReactNode
  /** The old Review today link (?review=1) is on its way to ?plan=1: the
   *  week steps aside for that moment. A Day session itself keeps the week
   *  beside the day (planning as tooltips, 2026-11-04). The shell stays, so
   *  the day under it is never remounted (walk, 2026-11-01). */
  stepAside?: boolean
  tasks: Task[]
  date: Date
  update: (id: string, patch: Partial<Task>) => Promise<boolean | void>
  /** Toggles a task's done state: the check on the week sheet's rows. */
  complete?: (id: string) => Promise<boolean | void>
  /** Steps on a task in progress. Without addStep, none can be added here. */
  addStep?: StepSavers['add']
  removeStep?: StepSavers['remove']
  loading: boolean
  error: boolean
  /** Reloads the tasks. The day page offers its own Try again. */
  retry: () => void
  weekView?: boolean
  onSelect?: (id: string) => void
}) {
  const { layers } = useDomain(), [people] = useAssigneeFilter(), { getCurrentUserMember, members = [] } = useFamilyMembers()
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
  // A goal or parent on the week stands for its steps (Scott, 2026-11-07),
  // unless someone is working it or waiting on it: then it stays one row and
  // shows its next step (Scott, 2026-11-09).
  const weekTasks = stepsInstead(weekListTasks(visible, week, lens.scopeId, { isCurrent: localYmd(week) === localYmd(weekStartAnchor(new Date(), wso)) }), visible, { keep: (t) => !!t.startedAt || !!t.isWaiting })
  const ymd = localYmd(date)
  const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const { word: dayWord } = dayWordFor(date)

  // The week's open work with no day yet, as the Week page's "No day yet"
  // reads it: not done, not on this day, not on another day of the week.
  // Earlier this week's first, each once.
  const now = new Date()
  const earlier = earlierThisWeek(visible, { weekStart: week, day: date, scopeId: lens.scopeId })
  const earlierIds = new Set(earlier.map((t) => t.id))
  // In the week's priority (Scott, 2026-11-08): the shared sort_order the
  // Week list is ordered in; never ordered after, oldest written first.
  const byOrder = (a: Task, b: Task) => compareSortOrder(a.sortOrder, b.sortOrder) || (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0)
  const open = [...[...earlier].sort(byOrder), ...weekTasks.filter((t) => !t.completed && !earlierIds.has(t.id)
    && !(t.scheduledFor && localYmd(t.scheduledFor) === ymd)
    && !placedInWeek(t, week, now)).sort(byOrder)]
  const doneTasks = weekTasks.filter((t) => t.completed)
  const doneCount = doneTasks.length
  // What is placed on a later day of this week, by day (Scott, 2026-11-07:
  // the sheet beside the day is the Week's own list, Sometime this week and
  // then the days). Its + brings it to this day.
  const weekEnd = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7)
  const openIds = new Set(open.map((t) => t.id))
  const later = visible.filter((t) => !t.completed && !openIds.has(t.id) && !!t.scheduledFor
    && localYmd(t.scheduledFor) > ymd && t.scheduledFor.getTime() < weekEnd.getTime())
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())
  const isThisWeek = localYmd(week) === localYmd(weekStartAnchor(new Date(), wso))

  const place = async (id: string) => {
    const task = [...earlier, ...weekTasks, ...later].find((t) => t.id === id && !t.completed)
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

  // A row dragged among the week's rows takes that place in the shared
  // order (the Week list's, Scott 2026-11-08); dragged onto the day, it is
  // planned for the day instead. Undo writes back every order it changed.
  const reorder = (id: string, toIndex: number) => {
    const task = open.find((t) => t.id === id)
    if (!task) return
    const was = new Map(open.map((t) => [t.id, t.sortOrder ?? null]))
    const writes = reorderTasksToIndex(open.map((t) => t.id), id, toIndex, was)
    if (writes.length === 0) return
    const write = (ws: { id: string; sortOrder: number | null }[]) => Promise.all(ws.map((w) => update(w.id, { sortOrder: w.sortOrder }))).then((r) => r.every((x) => x !== false))
    const up = toIndex < open.findIndex((t) => t.id === id)
    void activity.run(`Move “${task.title}” ${up ? 'up' : 'down'}`, () => write(writes), {
      ids: writes.map((w) => w.id), undo: async () => { await write(writes.map((w) => ({ id: w.id, sortOrder: was.get(w.id) ?? null }))) },
    })
  }

  const steps = stepWrites(activity.run, { add: addStep, remove: removeStep, toggle: complete })
  const tickNext = (id: string) => {
    const task = [...open, ...later].find((t) => t.id === id)
    const next = task && openSteps(task)[0]
    if (next) steps.done(next)
  }
  const peopleTools = (id: string, menu: RowStatusMenu) => {
    const task = [...open, ...later].find((t) => t.id === id)
    if (!task) return null
    return <SheetTaskTools task={task} members={members} write={({ label, patch, prev }) => {
      void activity.run(label, () => update(id, patch), { ids: [id], undo: async () => { await update(id, prev) } })
    }} steps={steps} status={menu} />
  }
  const completeTask = complete ? (id: string) => {
    const task = [...open, ...later].find((t) => t.id === id)
    if (!task) return
    void activity.run(`Done: “${task.title}”`, () => complete(id), { ids: [id], undo: async () => { await complete(id) } })
  } : undefined
  // Back to open: the Undo under a row just ticked, or a check in the done list.
  const reopenTask = complete ? (id: string) => {
    const task = weekTasks.find((t) => t.id === id) ?? [...open, ...later].find((t) => t.id === id)
    if (!task) return
    void activity.run(`Not done: “${task.title}”`, () => complete(id), { ids: [id], undo: async () => { await complete(id) } })
  } : undefined

  const range = formatWeekRangeShort(week)
  // A week row dropped anywhere on the day, its hours included, is placed
  // for the day with no time, the same as + (Scott, 2026-11-07: a task gets
  // a time only when it is certain to be done then; it was 2026-11-04's
  // "drag directly from the week strip to the calendar grid").
  const day = (
    <div className="ad-day vt-sheet-day"
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
          <PaperFold horizon="day" wide className="today-fold ad-fold" stowed={stepAside} edgeLabel={range} edgeCount={open.length}
            drive={weekDrive === undefined ? undefined : { above: weekDrive }}
            frontLabel={`${range}, to pick from`}
            above={<AboveSheet kicker={`Week · ${range}`} title={isThisWeek ? 'This week' : range} className="vt-sheet-week"
              rowsHeading={open.length > 0 ? 'Sometime this week' : undefined} shortList={TODAY_WEEK_SHORT_LIST}
              rows={open.map((t, i) => earlierIds.has(t.id)
                ? { id: t.id, title: t.title, ...sheetRowStatus(t), mark: earlierDayMark(t), anchor: i === 0 ? 'leftovers' : undefined }
                : { id: t.id, title: t.title, ...sheetRowStatus(t) })} doneCount={doneCount} foot={TODAY_WEEK_FOOT}
              empty={loading ? 'Loading this week’s tasks…' : error ? 'This week didn’t load.' : 'Nothing still to place this week.'}
              onPick={(id) => { if (!pending) void place(id) }} pickLabel={(title) => `Plan ${title} for ${dayWord}`}
              onComplete={completeTask} onReopen={reopenTask} doneRows={doneTasks.map((t) => ({ id: t.id, title: t.title }))}
              rowTools={peopleTools} onNextStep={tickNext} onOpen={onSelect} onReorder={reorder} onDragRow={(id, ev) => {
                // Dropped anywhere on the day, the hours included, it is
                // planned for the day with no time (Scott, 2026-11-07: tasks
                // get a time only when it is certain; set one on the task).
                ev.dataTransfer.setData(WEEK_ACTION_MIME, id); ev.dataTransfer.effectAllowed = 'move'
              }}>
              {later.length > 0 && <>
                <h3 className="above-sheet-sub above-sheet-rows-h">Later this week</h3>
                <SheetRows rows={later.map((t) => ({ id: t.id, title: t.title, ...sheetRowStatus(t), mark: t.scheduledFor!.toLocaleDateString('en-US', { weekday: 'short' }) }))}
                  label="Later this week" onPick={(id) => { if (!pending) void place(id) }} pickLabel={(title) => `Plan ${title} for ${dayWord}`}
                  onComplete={completeTask} onReopen={reopenTask} rowTools={peopleTools} onNextStep={tickNext} onOpen={onSelect} onDragRow={(id, ev) => { ev.dataTransfer.setData(WEEK_ACTION_MIME, id); ev.dataTransfer.effectAllowed = 'move' }} />
              </>}
              <div ref={setRoutinesSlot} className="ad-routines" />
            </AboveSheet>}>
            {day}
          </PaperFold>
        )}
      </section>
    </AlongsideContext.Provider>
  )
}
