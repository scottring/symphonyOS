import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { InboxStep, BetweenStep, AheadStep, RoutinesStep, dayList } from './WeekStepPanels'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import type { RoutineGroups, RoutineRow } from '@/lib/week/routineGroups'

const WEEK = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']

// Scott, 2026-10-03: planning a week one kind of thing at a time.
describe('InboxStep', () => {
  it('each capture gets this week, someday or done; an empty Inbox says so', () => {
    const onThisWeek = vi.fn()
    const t = createMockTask({ id: 'c1', title: 'Call the dentist', bucket: 'inbox' })
    const { rerender } = render(<InboxStep tasks={[t]} onThisWeek={onThisWeek} onSomeday={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'This week: Call the dentist' }))
    expect(onThisWeek).toHaveBeenCalledWith(t)
    rerender(<InboxStep tasks={[]} onThisWeek={onThisWeek} onSomeday={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText('Your Inbox is empty.')).toBeInTheDocument()
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
