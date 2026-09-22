import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMockTask } from '@/test/mocks/factories'
import { WeekList } from './WeekList'

const WEEK = new Date(2026, 9, 4)
const row = (over: Parameters<typeof createMockTask>[0]) => createMockTask({ bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...over })

describe('WeekList', () => {
  afterEach(() => { vi.useRealTimers() })
  it('lists the week\'s tasks, done rows struck and last, with their notes', () => {
    const tasks = [
      row({ id: 'a', title: 'Bike rack', createdAt: new Date(2026, 9, 1), completed: true, commitments: [{ level: 'week', periodStart: WEEK, status: 'done' }] }),
      row({ id: 'b', title: 'Call the plumber', createdAt: new Date(2026, 9, 2), commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] }),
    ]
    render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    const items = list.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Call the plumber')
    expect(items[0]).toHaveTextContent('from October')
    expect(items[1]).toHaveTextContent('Bike rack')
    expect(list.getByText('Bike rack')).toHaveClass('line-through')
    expect(list.queryByText(/\d+ (open|done|tasks)/)).toBeNull()
  })

  it("the row's note is beside the title button, not part of its name", () => {
    const tasks = [row({ id: 'b', title: 'Call the plumber', commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] })]
    render(<WeekList tasks={tasks} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByRole('button', { name: 'Call the plumber' })).toBeInTheDocument()
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('from October')
  })

  it('ticks and opens', () => {
    const onToggle = vi.fn(), onSelect = vi.fn()
    render(<WeekList tasks={[row({ id: 'b', title: 'Call the plumber' })]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={onToggle} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call the plumber' }))
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
    fireEvent.click(screen.getByRole('button', { name: 'Call the plumber' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('names another week instead of calling it "this week", keeping the region name stable', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 30, 9)) // the week of Sep 27 — WEEK is a FUTURE week
    render(<WeekList tasks={[row({ id: 'b', title: 'Call the plumber' })]} weekStart={WEEK} meId={null} userId="me" isCurrent={false} onToggle={vi.fn()} onSelect={vi.fn()} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByRole('heading')).toHaveTextContent('List for the week of Oct 4')
    expect(screen.queryByText(/This week's list/)).toBeNull()
  })

  it('empty: says so and offers to plan the week', () => {
    const onPlan = vi.fn()
    render(<WeekList tasks={[]} weekStart={WEEK} meId={null} userId="me" isCurrent onToggle={vi.fn()} onSelect={vi.fn()} onPlan={onPlan} />)
    expect(screen.getByText(/nothing on this week's list yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /plan this week/i }))
    expect(onPlan).toHaveBeenCalled()
  })
})
