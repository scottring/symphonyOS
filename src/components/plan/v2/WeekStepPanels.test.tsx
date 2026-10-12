import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { InboxSource, LastWeekSource, MonthGoalsSource, BetweenStep, AheadStep, RoutinesStep, dayList } from './WeekStepPanels'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import type { RoutineGroups, RoutineRow } from '@/lib/week/routineGroups'

const WEEK = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']

// Scott, 2026-10-12: the Inbox is the first source beside the week's list.
describe('InboxSource', () => {
  const props = { weekName: 'week 43', stateOf: () => undefined, onAdd: vi.fn(), onSomeday: vi.fn(), onDone: vi.fn(), onOpen: vi.fn() }
  it('each capture is a card whose one action adds it to the week; Someday and Done are quieter; an empty Inbox says so', () => {
    const onAdd = vi.fn()
    const t = createMockTask({ id: 'c1', title: 'Call the dentist', bucket: 'inbox' })
    const { rerender } = render(<InboxSource {...props} tasks={[t]} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Call the dentist to week 43' }))
    expect(onAdd).toHaveBeenCalledWith(t)
    expect(screen.getByRole('button', { name: 'Someday: Call the dentist' })).toBeInTheDocument()
    rerender(<InboxSource {...props} tasks={[]} />)
    expect(screen.getByText('Your Inbox is empty. Nothing to choose from here.')).toBeInTheDocument()
  })

  // Scott, 2026-10-04: "we also need a trash button for inbox items".
  it('each capture can be thrown away', () => {
    const onDelete = vi.fn()
    const t = createMockTask({ id: 'c1', title: 'event: FedEx Delivery', bucket: 'inbox' })
    render(<InboxSource {...props} tasks={[t]} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete event: FedEx Delivery' }))
    expect(onDelete).toHaveBeenCalledWith(t)
  })

  it('while its write is in flight the card’s actions wait; a failed one says so on the card', () => {
    const t = createMockTask({ id: 'c1', title: 'Call the dentist', bucket: 'inbox' })
    const { rerender } = render(<InboxSource {...props} tasks={[t]} stateOf={() => 'pending'} />)
    expect(screen.getByRole('button', { name: 'Add Call the dentist to week 43' })).toBeDisabled()
    rerender(<InboxSource {...props} tasks={[t]} stateOf={() => 'failed'} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Not added.')
  })
})

describe('LastWeekSource', () => {
  const vm = (id: string, title: string) => ({ task: createMockTask({ id, title }), fate: 'open' as const, partOf: null, where: 'Tuesday, October 13' })
  it('an undecided card offers every decision; a decided one wears it and says the record keeps it', () => {
    const onDecide = vi.fn()
    const open = vm('a', 'Fix the gate')
    const { rerender } = render(<LastWeekSource rows={[{ vm: open, state: undefined }]} earlier={[]} done={[]} prevName="last week" weekName="week 43" onDecide={onDecide} onOpen={vi.fn()} />)
    for (const name of ['Bring Fix the gate into week 43', 'It’s done: Fix the gate', 'Someday: Fix the gate', 'Let go of Fix the gate', 'Leave Fix the gate where it is']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Bring Fix the gate into week 43' }))
    expect(onDecide).toHaveBeenCalledWith(open, 'carried')
    rerender(<LastWeekSource rows={[{ vm: open, decision: 'carried', state: undefined }]} earlier={[]} done={[]} prevName="last week" weekName="week 43" onDecide={onDecide} onOpen={vi.fn()} />)
    expect(screen.getByText('Brought forward')).toBeInTheDocument()
    expect(screen.getByText(/Last week’s record keeps it/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bring Fix the gate into week 43' })).toBeNull()
  })
})

describe('MonthGoalsSource', () => {
  it('a selected goal previews its week tasks — the same records — and offers an add for it', () => {
    const g = createMockTask({ id: 'm1', title: 'Plan the trip' })
    const kids = [createMockTask({ id: 'w1', title: 'Book the cabin' }), createMockTask({ id: 'w2', title: 'Pack', completed: true })]
    const onStartAdd = vi.fn()
    render(<MonthGoalsSource months={[{ name: 'October', start: new Date(2026, 9, 1), goals: [{ task: g, children: kids }], done: 0 }]} weekName="week 43"
      selected="m1" onSelect={vi.fn()} linkedGoal={null} adding={null} onStartAdd={onStartAdd} onCancelAdd={vi.fn()}
      draftOf={() => ''} onDraft={vi.fn()} onAdd={vi.fn()} onOpenMonth={vi.fn()} />)
    const card = screen.getByRole('region', { name: 'October goal: Plan the trip' })
    expect(within(card).getByText('2 tasks week 43, 1 done')).toBeInTheDocument()
    expect(within(card).getByRole('list', { name: 'week 43 tasks for Plan the trip' }).textContent).toBe('Book the cabinPack')
    fireEvent.click(within(card).getByRole('button', { name: 'Add a task week 43 for Plan the trip' }))
    expect(onStartAdd).toHaveBeenCalledWith('m1')
  })
})

describe('BetweenStep', () => {
  it('shows what you’re waiting on and the threads to talk through', () => {
    const t = createMockTask({ id: 'w1', title: 'Plumber quote', isWaiting: true, waitingFor: 'Joe' })
    render(<BetweenStep waiting={[{ task: t, checkBack: new Date(2026, 9, 6), due: false }]}
      threads={[{ sessionId: 's', entityType: 'task', entityId: 'x', title: 'Thanksgiving', lastAuthor: 'Iris', lastText: 'Your mom’s?', lastAt: new Date(2026, 9, 2), unread: true }]}
      onOpenTask={vi.fn()} onOpenThread={vi.fn()} />)
    expect(within(screen.getByRole('region', { name: 'Waiting on' })).getByText('Plumber quote')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'To discuss' })).getByText('Thanksgiving')).toBeInTheDocument()
  })
})

describe('AheadStep', () => {
  it('lists the next weeks’ fixed dates and deadlines in date order', () => {
    render(<AheadStep from={new Date(2026, 9, 10)}
      landmarks={[{ id: 'l', title: 'No school', start: new Date(2026, 9, 12), end: new Date(2026, 9, 12) }]}
      dated={[createMockTask({ id: 'd', title: 'Coppermine signup closes', scheduledFor: new Date(2026, 9, 11), isAllDay: true })]} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toMatch(/Coppermine signup closes/)
    expect(rows[1]).toMatch(/No school/)
  })
})

describe('AheadStep — acting on what’s coming', () => {
  it('a dated task opens, and can be started this week', () => {
    const onOpen = vi.fn(), onStart = vi.fn()
    const t = createMockTask({ id: 'd', title: 'Coppermine signup closes', scheduledFor: new Date(2026, 9, 11), isAllDay: true })
    render(<AheadStep from={new Date(2026, 9, 10)} landmarks={[]} dated={[t]} onOpen={onOpen} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Coppermine signup closes' }))
    expect(onOpen).toHaveBeenCalledWith(t)
    fireEvent.click(screen.getByRole('button', { name: 'Start Coppermine signup closes this week' }))
    expect(onStart).toHaveBeenCalledWith(t)
  })
})

describe('dayList', () => {
  it('says a routine’s days the short way', () => {
    expect(dayList(['2026-10-03'], WEEK)).toBe('Sat')
    expect(dayList(['2026-10-03', '2026-10-06', '2026-10-08'], WEEK)).toBe('Sat, Tue, Thu')
    expect(dayList(WEEK.slice(2), WEEK)).toBe('Weekdays')
    expect(dayList(WEEK, WEEK)).toBe('Every day')
  })
})

describe('RoutinesStep', () => {
  const row = (name: string, o: Partial<RoutineRow> = {}, r: Parameters<typeof createMockRoutine>[0] = {}): RoutineRow =>
    ({ routine: createMockRoutine({ id: name, name, time_of_day: null, ...r }), dayKeys: ['2026-10-03'], skippedKeys: [], plannedKey: null, ...o })
  const groups = (o: Partial<RoutineGroups>): RoutineGroups => ({ timed: [], setDay: [], weekend: [], anyDay: [], everyDay: [], lessOften: [], ...o })
  const base = { weekKeys: WEEK, weekendKeys: ['2026-10-03', '2026-10-04'], onSkip: vi.fn(), onUnskip: vi.fn(), onPlanDay: vi.fn(), onOpen: vi.fn() }

  it('asks each group only its own question', () => {
    const onSkip = vi.fn(); const onPlanDay = vi.fn()
    render(<RoutinesStep {...base} onSkip={onSkip} onPlanDay={onPlanDay} groups={groups({
      timed: [row('Bedtime', { dayKeys: WEEK }, { time_of_day: '19:00' })],
      setDay: [row('Kids clean rooms')],
      weekend: [row('Yard weeding', { dayKeys: ['2026-10-03', '2026-10-04'] }, { recurrence_pattern: { type: 'weekend' } })],
      anyDay: [row('Deep clean fridge', { dayKeys: [] })],
    })} />)
    expect(within(screen.getByRole('region', { name: 'At a set time' })).getByText('Every day · 7p')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('region', { name: 'On a set day' })).getByRole('button', { name: 'Skip Kids clean rooms this week' }))
    expect(onSkip).toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('region', { name: 'Sometime this weekend' })).getByRole('button', { name: 'Sun' }))
    expect(onPlanDay).toHaveBeenCalledWith(expect.objectContaining({ routine: expect.objectContaining({ name: 'Yard weeding' }) }), '2026-10-04')
    fireEvent.click(within(screen.getByRole('region', { name: 'Any day this week' })).getByRole('button', { name: 'Tue' }))
    expect(onPlanDay).toHaveBeenLastCalledWith(expect.objectContaining({ routine: expect.objectContaining({ name: 'Deep clean fridge' }) }), '2026-10-06')
    expect(within(screen.getByRole('region', { name: 'Every day' })).getByText('Nothing here this week.')).toBeInTheDocument()
  })

  it('a weekend routine already given Saturday shows Saturday chosen; Sometime takes it back', () => {
    const onPlanDay = vi.fn()
    render(<RoutinesStep {...base} onPlanDay={onPlanDay} groups={groups({
      weekend: [row('Yard weeding', { dayKeys: ['2026-10-03', '2026-10-04'], plannedKey: '2026-10-03' }, { recurrence_pattern: { type: 'weekend' } })],
    })} />)
    const seg = within(screen.getByRole('region', { name: 'Sometime this weekend' }))
    expect(seg.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(seg.getByRole('button', { name: 'Sometime' }))
    expect(onPlanDay).toHaveBeenCalledWith(expect.anything(), null)
  })
})
