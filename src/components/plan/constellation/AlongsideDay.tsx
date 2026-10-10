// src/components/plan/constellation/AlongsideDay.tsx
//
// The connected workspace's day with its week beside it. The week is the
// shared compact list (canvas/week, 2026-10-10) that Today's classic column
// draws too; this file keeps its own data (the week's actions through the
// page's layer and people filters) and its own writer (lineDropUpdates
// through `update`), reporting each placement through the canvas activity
// strip with an Undo that puts the fields back.
import { useRef, useState, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/task'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { weekListTasks } from '@/lib/planning/weekList'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { parentOf, WEEK_TO_MONTH } from '@/lib/planning/journalGroups'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { formatTimeCompact } from '@/lib/dateHelpers'
import { useSideColumnSlot } from '@/shell/SideColumn'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { CompactWeekList, type CompactRow } from '@/components/canvas/week/CompactWeekList'
import { dayWordFor } from '@/components/canvas/week/compactWeek'
import { AlongsideContext } from './AlongsideContext'
import './alongside.css'

const WEEK_ACTION_MIME = 'application/x-symphony-week-action'

export function AlongsideDay({ children, tasks, date, update, complete, loading, error, retry, weekView = false, onSelect }: {
  children: ReactNode
  tasks: Task[]
  date: Date
  update: (id: string, patch: Partial<Task>) => Promise<boolean | void>
  /** Toggles a task's done state and says whether it saved. Absent: rows
   *  carry no check. */
  complete?: (id: string) => Promise<boolean | void>
  loading: boolean
  error: boolean
  retry: () => void
  weekView?: boolean
  onSelect?: (id: string) => void
}) {
  const { layers } = useDomain(), [people] = useAssigneeFilter(), { getCurrentUserMember } = useFamilyMembers()
  const navigate = useNavigate()
  const activity = useCanvasActivity()
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width:700px)').matches)
  const [pending, setPending] = useState<string | null>(null), [message, setMessage] = useState('')
  const companion = useSideColumnSlot()
  const showChoices = open && !companion.open
  const workspaceControls = useMemo(() => weekView ? null : { showWeek: () => setOpen(true) }, [weekView])
  const lock = useRef(false)
  const wso = readCadenceConfig().weekStartsOn
  const week = weekStartAnchor(date, wso)
  const lens = planPeopleLens(people, getCurrentUserMember()?.id ?? null)
  const visible = filterTasksForLayers(tasks, layers).filter(lens.keep)
  const ids = new Set(visible.map((t) => t.id))
  const weekTasks = weekListTasks(visible, week, lens.scopeId, { isCurrent: localYmd(week) === localYmd(weekStartAnchor(new Date(), wso)) })
  const ymd = localYmd(date)
  const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const { word: dayWord, tag: dayTag } = dayWordFor(date)

  const rows: CompactRow<Task>[] = weekTasks.map((t) => {
    const onDay = !t.completed && !!t.scheduledFor && localYmd(t.scheduledFor) === ymd
    const p = parentOf(t, WEEK_TO_MONTH, ids)
    const parentTitle = p ? visible.find((x) => x.id === p.id)?.title : undefined
    return {
      key: t.id, id: t.id, title: t.title, item: t, completed: t.completed,
      parent: p && parentTitle ? { id: p.id, title: parentTitle } : null,
      onDay: onDay ? (t.isAllDay === false ? `${dayTag} ${formatTimeCompact(t.scheduledFor!)}` : dayTag) : null,
      context: !onDay && !t.completed && t.scheduledFor
        ? `Currently ${t.scheduledFor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${t.isAllDay === false ? ` at ${t.scheduledFor.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}`
        : null,
    }
  })
  const stillToPlace = rows.some((r) => !r.completed && !r.onDay)

  const place = async (id: string) => {
    const task = weekTasks.find((t) => t.id === id && !t.completed)
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
    } finally { lock.current = false; setPending(null) }
  }
  const toggle = (t: Task) => {
    if (!complete) return
    void activity.run(t.completed ? `Reopen “${t.title}”` : `Done: “${t.title}”`, () => complete(t.id), {
      ids: [t.id], undo: () => complete(t.id),
    })
  }

  const weekNo = weekOfYear(week, wso)
  return (
    <AlongsideContext.Provider value={workspaceControls}>
      <section className="ad-shell">
        {!weekView && (
          <div className="ad-nav" role="group" aria-label="Today view">
            <button aria-expanded={showChoices} disabled={!!companion.open} aria-controls="ad-week" onClick={() => setOpen((v) => !v)}>
              {companion.open ? 'Weekly choices return when details close' : open ? 'Hide this week' : 'Show this week'}
            </button>
          </div>
        )}
        <p role="status" className="ad-status">{message}</p>
        <div className={`ad-layout ${showChoices && !weekView ? 'ad-open' : ''}`}>
          <div className="ad-day"
            onDragOver={(e) => { if (e.dataTransfer.types.includes(WEEK_ACTION_MIME)) e.preventDefault() }}
            onDropCapture={(e) => { const id = e.dataTransfer.getData(WEEK_ACTION_MIME); if (id) { e.preventDefault(); e.stopPropagation(); void place(id) } }}>
            {children}
          </div>
          {!weekView && (
            <aside id="ad-week" className="ad-week cw-column" hidden={!showChoices}>
              <h2>This week</h2>
              <p className="ad-week-hint">Drag onto the day, or press + to plan it for {dayWord}. Its connections stay with it.</p>
              {loading ? <p>Loading weekly actions…</p>
                : error ? <p role="alert">Could not load this week. <button onClick={retry}>Retry</button></p>
                : <>
                  {!stillToPlace && <p className="ad-week-hint">Nothing else to place this week in the current filters.</p>}
                  <CompactWeekList rows={rows} label="This week’s actions"
                    addLabel={(title) => `Add ${title} to ${dayWord}`}
                    onAdd={(t) => { void place(t.id) }}
                    onComplete={complete ? toggle : undefined}
                    onOpen={onSelect ? (t) => onSelect(t.id) : undefined}
                    onOpenParent={onSelect}
                    onDragStart={(t, ev) => { ev.dataTransfer.setData(WEEK_ACTION_MIME, t.id); ev.dataTransfer.effectAllowed = 'move' }}
                    busyKey={pending} disabled={!!pending} />
                  <button type="button" className="canvas-link cw-open" onClick={() => navigate(`/week?view=alongside&start=${localYmd(week)}`)}>Open week {weekNo} →</button>
                </>}
            </aside>
          )}
        </div>
      </section>
    </AlongsideContext.Provider>
  )
}
