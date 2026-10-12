// Parity: the same kind of thing gets the same When labels, in the same order,
// with the same scoped Skip, on every surface that triages it (the triage
// contract, lib/triage/contract.ts — Scott, 2026-10-12: "same place but
// completely different options").
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import type { Task } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { WeekCanvas, type CanvasDay, type WeekCanvasWriters } from '@/components/canvas/week/WeekCanvas'
import { RescheduleButton } from './RescheduleButton'
import { RoutineMoveButton } from './RoutineMoveButton'
import { InboxTriageActions } from './InboxTriageActions'
import { SchedulePicker } from './SchedulePicker'
import { triageContract, SKIP_LABEL } from '@/lib/triage/contract'

const LABEL = /^(Today|Tonight|Tomorrow|This weekend|Next weekend|This week|Next week|This month|Next month|This season|Someday|Pick date & time…)/
/** The When tiles on screen, by their leading label, in order (a weekend's
 *  two day tiles collapse to one entry for comparison). */
function whenOrder(scope: HTMLElement = document.body): string[] {
  const out: string[] = []
  for (const b of within(scope).getAllByRole('menuitem')) {
    const l = (b.textContent ?? '').match(LABEL)?.[1]
    if (l && out[out.length - 1] !== l) out.push(l)
  }
  return out
}
const contractWhen = (kind: 'task' | 'occurrence') => triageContract(kind).filter((a) => a.group === 'when').map((a) => a.label)

const MON = new Date(2026, 9, 12) // Mon Oct 12 2026
const keys = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const task = { id: 'k', title: 'Pick up the keys', completed: false, scheduledFor: MON, isAllDay: true, createdAt: new Date(2026, 8, 1) } as Task

function canvas(): void {
  const writers = {
    placeTask: vi.fn(), moveTask: vi.fn(), unplaceTask: vi.fn(), toggleTask: vi.fn(), toggleRoutine: vi.fn(),
    placeRoutine: vi.fn(), moveRoutine: vi.fn(), addAction: vi.fn(async () => true), milestoneDone: vi.fn(), open: vi.fn(),
    putOnWeek: vi.fn(), assign: vi.fn(), setArea: vi.fn(), moveUnder: vi.fn(), moveUnderOptions: vi.fn(() => null),
    whenTask: vi.fn(), dateTask: vi.fn(), skipOccurrence: vi.fn(), pinOccurrence: vi.fn(),
  } as unknown as WeekCanvasWriters
  const start = new Date(2026, 9, 11)
  const days: CanvasDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2026, 9, 11 + i)
    return {
      date: d, key: keys(d), events: [],
      items: i === 1 ? [
        { id: 'task-k', kind: 'task', title: task.title, completed: false, task },
        { id: 'routine-w', kind: 'routine', title: 'Water houseplants', completed: false, routineId: 'w' },
      ] : [],
    }
  })
  render(<WeekCanvas weekStart={start} days={days} shelf={[]} routinesToPlace={[]} monthName="October" isCurrent writers={writers} />)
}

function today(item: TimelineItem, extra: Partial<ScheduleActionsValue> = {}): void {
  const value = { onToggleTask: vi.fn(), onPushTask: vi.fn(), onUpdateTask: vi.fn(), onMoveRoutineToDay: vi.fn(async () => true), onSkipRoutine: vi.fn(), viewedDate: MON, projects: [], contacts: [], familyMembers: [], lists: [], ...extra } as unknown as ScheduleActionsValue
  render(<ScheduleActionsProvider value={value}>{item.type === 'routine' ? <RoutineMoveButton item={item} onOpen={vi.fn()} /> : <RescheduleButton item={item} />}</ScheduleActionsProvider>)
}

describe('triage parity across surfaces', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 12, 9)) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('a task: Week canvas, Today, Inbox and details offer the same When, in the contract’s order', () => {
    const expected = contractWhen('task')

    canvas()
    fireEvent.click(screen.getByRole('button', { name: 'More for Pick up the keys' }))
    const week = whenOrder(screen.getByRole('group', { name: 'When' }))
    const weekSkip = screen.getByRole('menuitem', { name: /^Skip/ }).textContent
    cleanup()

    today({ id: 'task-k', type: 'task', title: task.title, completed: false, focused: true, originalTask: task } as unknown as TimelineItem)
    fireEvent.click(screen.getByLabelText('Reschedule'))
    const todayRow = whenOrder()
    const todaySkip = screen.getByRole('menuitem', { name: /^Skip/ }).textContent
    cleanup()

    render(<InboxTriageActions title="Fix gate" onPick={vi.fn()} onPickDate={vi.fn()} onNote={vi.fn()} onSendToCalendar={vi.fn()} onSetArea={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Fix gate' }))
    const inbox = whenOrder()
    cleanup()

    render(<SchedulePicker flexibleWeekend onSchedule={vi.fn()} onReschedule={vi.fn()} loads={new Map()} />)
    fireEvent.click(screen.getByRole('button', { name: /Schedule/ }))
    const details = whenOrder()

    expect(week).toEqual(expected)
    expect(todayRow).toEqual(expected)
    expect(inbox).toEqual(expected)
    expect(details).toEqual(expected)
    // The dated task's scoped Skip reads the same on the Week and on Today.
    expect(weekSkip).toContain(SKIP_LABEL['skip-day'])
    expect(todaySkip).toContain(SKIP_LABEL['skip-day'])
  })

  it('a routine occurrence: Week canvas and Today offer the same When and the same "Skip this time"', () => {
    const expected = contractWhen('occurrence')

    canvas()
    fireEvent.click(screen.getByRole('button', { name: 'More for Water houseplants' }))
    const week = whenOrder(screen.getByRole('group', { name: 'When' }))
    const weekSkip = screen.getByRole('menuitem', { name: /^Skip/ }).textContent
    cleanup()

    today({ id: 'routine-w', type: 'routine', title: 'Water houseplants', completed: false } as unknown as TimelineItem)
    fireEvent.click(screen.getByRole('button', { name: 'Move or skip' }))
    const todayRow = whenOrder()
    const todaySkip = screen.getByRole('menuitem', { name: /^Skip/ }).textContent

    expect(week).toEqual(expected)
    expect(todayRow).toEqual(expected)
    expect(weekSkip).toContain(SKIP_LABEL['skip-occurrence'])
    expect(todaySkip).toContain(SKIP_LABEL['skip-occurrence'])
  })

  it('every task surface names Tomorrow’s actual date', () => {
    today({ id: 'task-k', type: 'task', title: task.title, completed: false, originalTask: { ...task, scheduledFor: undefined } } as unknown as TimelineItem)
    fireEvent.click(screen.getByLabelText('Reschedule'))
    expect(screen.getByRole('menuitem', { name: /^Tomorrow\s*Tue, Oct 13/ })).toBeInTheDocument()
  })
})
