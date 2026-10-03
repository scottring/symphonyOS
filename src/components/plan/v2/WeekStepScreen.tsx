// The data behind the week's step panels, read only while a planning session
// shows one of them: the Inbox, waiting items and threads, the weeks ahead,
// and the week's routines with their occurrences. WeekV2 mounts this inside
// the session, so the page outside a session reads none of it.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types/task'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useRoutines } from '@/hooks/useRoutines'
import { useDomain } from '@/hooks/useDomain'
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox'
import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { selectWaiting } from '@/lib/today/waiting'
import { landmarksIn } from '@/lib/planning/v2/planV2'
import { localYmd } from '@/lib/cadence/config'
import { routineGroups, type RoutineRow } from '@/lib/week/routineGroups'
import { InboxStep, BetweenStep, AheadStep, RoutinesStep } from './WeekStepPanels'

export type PanelStep = 'inbox' | 'between' | 'ahead' | 'routines'
const DAY = 86_400_000
const dateOf = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }

export function WeekStepMain({ step, tasks, weekStart, onSelectTask, onThisWeek, onSomeday, onDone }: {
  step: PanelStep
  tasks: Task[]
  weekStart: Date
  onSelectTask: (id: string) => void
  onThisWeek: (t: Task) => void
  onSomeday: (t: Task) => void
  onDone: (t: Task) => void
}) {
  const navigate = useNavigate()
  const selection = useSelectionOptional()
  const { activeRoutines } = useRoutines()
  const { layers } = useDomain()
  const { setPlanned, skip, undoDone } = useActionableInstances()
  const instances = useWeekInstances(weekStart, step === 'routines' ? 7 : 0)
  const { rows: threadRows } = useDiscussionInbox()
  const { events } = useDayLoadEvents(step === 'ahead')

  const weekEnd = useMemo(() => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7), [weekStart])
  const weekKeys = useMemo(() => Array.from({ length: 7 }, (_, i) => localYmd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))), [weekStart])
  const weekendKeys = weekKeys.filter((k) => { const dow = dateOf(k).getDay(); return dow === 6 || dow === 0 })

  if (step === 'inbox') {
    const inbox = tasks.filter((t) => !t.completed && t.bucket === 'inbox')
    return <InboxStep tasks={inbox} onOpen={(t) => onSelectTask(t.id)} onThisWeek={onThisWeek} onSomeday={onSomeday} onDone={onDone} />
  }
  if (step === 'between') {
    const waiting = selectWaiting(tasks).filter((r) => !r.checkBack || r.checkBack < weekEnd)
    const threads = threadRows.filter((r) => r.unread || r.lastAt.getTime() >= weekStart.getTime() - 14 * DAY)
    return <BetweenStep waiting={waiting} threads={threads} onOpenTask={onSelectTask}
      onOpenThread={(row) => (row.entityType === 'task' ? onSelectTask(row.entityId) : navigate('/discussions'))} />
  }
  if (step === 'ahead') {
    const to = new Date(weekEnd.getTime() + 21 * DAY)
    const landmarks = landmarksIn(events, weekEnd, new Date(to.getTime() - DAY))
    const dated = tasks.filter((t) => !t.completed && t.scheduledFor && t.scheduledFor >= weekEnd && t.scheduledFor < to)
    return <AheadStep from={weekEnd} landmarks={landmarks} dated={dated} />
  }
  const groups = routineGroups({ routines: activeRoutines, weekStart, dayCount: 7, instances, layers })
  const skipRow = (row: RoutineRow) => { for (const k of row.dayKeys.filter((k) => !row.skippedKeys.includes(k))) void skip('routine', row.routine.id, dateOf(k)) }
  const unskipRow = (row: RoutineRow) => { for (const k of row.skippedKeys) void undoDone('routine', row.routine.id, dateOf(k)) }
  const planDay = async (row: RoutineRow, key: string | null) => {
    if (row.plannedKey && row.plannedKey !== key) await setPlanned('routine', row.routine.id, dateOf(row.plannedKey), false)
    if (key && key !== row.plannedKey) await setPlanned('routine', row.routine.id, dateOf(key), true)
  }
  return <RoutinesStep groups={groups} weekKeys={weekKeys} weekendKeys={weekendKeys} onSkip={skipRow} onUnskip={unskipRow}
    onPlanDay={(row, key) => void planDay(row, key)} onOpen={(id) => selection?.setSelection({ kind: 'routine', id })} />
}
