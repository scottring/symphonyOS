import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekMonthRail } from './WeekMonthRail'
import type { Task } from '@/types/task'

const now = new Date()
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
let n = 0
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), bucket: 'month', ...over,
} as Task)

describe('WeekMonthRail', () => {
  beforeEach(() => localStorage.clear())

  it("lists this month's goals first, then tasks; other months stay out", () => {
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[
      task({ title: 'Repaint the porch', monthStart: thisMonth }),
      task({ title: 'Read more', monthStart: thisMonth, isGoal: true }),
      task({ title: 'Old thing', monthStart: lastMonth }),
      task({ title: 'Legacy row' }), // NULL month_start → current month
    ]} />)
    const titles = screen.getAllByRole('button', { name: /porch|Read more|Legacy/ }).map((b) => b.textContent)
    expect(titles[0]).toContain('Read more')
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.queryByText('Old thing')).not.toBeInTheDocument()
    expect(screen.getByText('Legacy row')).toBeInTheDocument()
  })

  it('marks placed originals and strikes done ones', () => {
    const placed = task({ title: 'Repaint the porch', monthStart: thisMonth })
    const copy = task({ title: 'Repaint the porch', bucket: 'week', sourceId: placed.id })
    const done = task({ title: 'Book dentist', monthStart: thisMonth, completed: true })
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[placed, copy, done]} />)
    expect(screen.getByText('→ placed')).toBeInTheDocument()
    expect(screen.getByText('Book dentist')).toHaveClass('line-through')
    // The copy itself (a week row) is not on the month list.
    expect(screen.getAllByText('Repaint the porch')).toHaveLength(1)
  })

  it('opens the panel for a row and collapses persistently', () => {
    const onSelect = vi.fn()
    const { unmount } = render(<WeekMonthRail onSelectItem={onSelect} tasks={[task({ id: 'x', title: 'Repaint', monthStart: thisMonth })]} />)
    fireEvent.click(screen.getByRole('button', { name: /Repaint/ }))
    expect(onSelect).toHaveBeenCalledWith('task-x')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse this month' }))
    expect(screen.queryByText('Repaint')).not.toBeInTheDocument()
    unmount()
    render(<WeekMonthRail onSelectItem={onSelect} tasks={[task({ title: 'Repaint', monthStart: thisMonth })]} />)
    expect(screen.queryByText('Repaint')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand this month' })).toBeInTheDocument()
  })

  it('says so when the month list is empty', () => {
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[]} />)
    expect(screen.getByText("Nothing on this month's list.")).toBeInTheDocument()
  })

  // The weekly gesture: reference the month list, decide what to do this week.
  // With no "This month" tab to drag from, the rail row itself offers the
  // copy-down — one tap, not a drag, so nothing links and nothing moves.
  it('offers → this week on an open task, not on goals, placed or done rows', () => {
    const onAdd = vi.fn()
    const open = task({ id: 'o', title: 'Repaint the porch', monthStart: thisMonth })
    const goal = task({ id: 'g', title: 'Read more', monthStart: thisMonth, isGoal: true })
    const placed = task({ id: 'p', title: 'Book dentist', monthStart: thisMonth })
    const copy = task({ id: 'c', title: 'Book dentist', bucket: 'week', sourceId: 'p' })
    const done = task({ id: 'd', title: 'Mow', monthStart: thisMonth, completed: true })
    render(<WeekMonthRail onSelectItem={() => {}} onAddToWeek={onAdd} tasks={[open, goal, placed, copy, done]} />)
    expect(screen.getByRole('button', { name: 'Add Repaint the porch to this week' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Read more to this week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Book dentist to this week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Mow to this week' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Repaint the porch to this week' }))
    expect(onAdd).toHaveBeenCalledWith('o')
  })

  // The rail plans MY week. Iris's month items — assigned exclusively to her —
  // are rightly VISIBLE elsewhere (shared context), but they aren't mine to
  // put on my week. Same rule the strip already applies (doableBy).
  it('hides month items assigned exclusively to someone else; unassigned and mine stay', () => {
    render(<WeekMonthRail onSelectItem={() => {}} meId="me" tasks={[
      task({ title: 'Mine', monthStart: thisMonth, assignedTo: 'me' }),
      task({ title: 'Unassigned', monthStart: thisMonth }),
      task({ title: 'Ours', monthStart: thisMonth, assignedToAll: ['me', 'iris'] }),
      task({ title: "Iris's workout plan", monthStart: thisMonth, assignedTo: 'iris' }),
      task({ title: "Iris's reading", monthStart: thisMonth, assignedToAll: ['iris'] }),
    ]} />)
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('Ours')).toBeInTheDocument()
    expect(screen.queryByText("Iris's workout plan")).not.toBeInTheDocument()
    expect(screen.queryByText("Iris's reading")).not.toBeInTheDocument()
  })

  it('shows everything when no member id is known (legacy callers)', () => {
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[task({ title: "Iris's reading", monthStart: thisMonth, assignedTo: 'iris' })]} />)
    expect(screen.getByText("Iris's reading")).toBeInTheDocument()
  })
})
