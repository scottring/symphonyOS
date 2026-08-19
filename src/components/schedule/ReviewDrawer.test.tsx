import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ReviewDrawer, BACKLOG_SESSION_CAP } from './ReviewDrawer'
import type { Task } from '@/types/task'
import type { AttentionItem } from '@/lib/today/attention'

vi.mock('@/hooks/useEveningReflection', () => ({
  useEveningReflection: () => ({
    highlight: '', setHighlight: vi.fn(), notes: '', setNotes: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined), loading: false,
  }),
}))

const today = new Date()
const weekStart = new Date(today)

const task = (p: Partial<Task>): Task => ({ id: 'x', title: 't', completed: false, ...p } as Task)
const attn = (t: Task, ageDays: number): AttentionItem =>
  ({ task: t, reason: 'slipped', ageDays } as AttentionItem)

const base = {
  isOpen: true as const,
  onClose: vi.fn(),
  viewedDate: today,
  currentWeekStart: weekStart,
  onUpdateTask: vi.fn(),
  tasks: [] as Task[],
  attentionItems: [] as AttentionItem[],
  overdueTasks: [] as Task[],
}

describe('ReviewDrawer — evening keeps the end-of-day ritual', () => {
  it("celebrates today's completed tasks", () => {
    render(<ReviewDrawer {...base} mode="evening" tasks={[
      task({ id: 'a', title: 'Did A', completed: true, scheduledFor: today }),
      task({ id: 'b', title: 'Did B', completed: true, scheduledFor: today }),
    ]} />)
    expect(screen.getByText(/You closed 2 things today/)).toBeInTheDocument()
    expect(screen.getByText('Did A')).toBeInTheDocument()
  })

  it('pushes an unfinished item to tomorrow', async () => {
    const onUpdateTask = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="evening" onUpdateTask={onUpdateTask} tasks={[
      task({ id: 'u', title: 'Call plumber', completed: false, scheduledFor: today }),
    ]} />)
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Tomorrow/ }))
    expect(onUpdateTask).toHaveBeenCalledWith('u', expect.objectContaining({ bucket: 'timed' }))
    expect(screen.getByText('tomorrow')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(<ReviewDrawer {...base} mode="evening" isOpen={false} />)
    expect(screen.queryByText('End of day')).not.toBeInTheDocument()
  })
})

describe('ReviewDrawer — morning goes straight to triage', () => {
  it('skips the evening ritual sections', () => {
    render(<ReviewDrawer {...base} mode="morning" tasks={[
      task({ id: 'a', title: 'Did A', completed: true, scheduledFor: today }),
    ]} />)
    expect(screen.getByRole('heading', { name: 'Start the day' })).toBeInTheDocument()
    expect(screen.queryByText(/You closed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/best part of today/)).not.toBeInTheDocument()
  })

  it('caps the backlog at the session cap, oldest first, and says how many wait', () => {
    const items = Array.from({ length: BACKLOG_SESSION_CAP + 3 }, (_, i) =>
      attn(task({ id: `s${i}`, title: `Slipped ${i}` }), 10 + i))
    render(<ReviewDrawer {...base} mode="morning" attentionItems={items} />)
    // Oldest (highest age) render; the youngest three wait for the next session.
    expect(screen.getByText(`Slipped ${BACKLOG_SESSION_CAP + 2}`)).toBeInTheDocument()
    expect(screen.queryByText('Slipped 0')).not.toBeInTheDocument()
    expect(screen.getByText(/\+3 more waiting/)).toBeInTheDocument()
  })

  it('a backlog verdict writes through pushTask and resolves the row', async () => {
    const onPushTask = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="morning" onPushTask={onPushTask}
      attentionItems={[attn(task({ id: 's', title: 'Old thing' }), 100)]} />)
    const row = screen.getByText('Old thing').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Today' }))
    expect(onPushTask).toHaveBeenCalledWith('s', expect.any(Date))
    expect(within(row).getByText('today')).toBeInTheDocument()
  })

  it('Someday writes an explicit bucket move, never a partial leftover', async () => {
    const onUpdateTask = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="morning" onUpdateTask={onUpdateTask}
      attentionItems={[attn(task({ id: 's', title: 'Old thing' }), 100)]} />)
    const row = screen.getByText('Old thing').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Someday' }))
    expect(onUpdateTask).toHaveBeenCalledWith('s',
      { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
  })

  it('shows the week pool with its own verdicts', () => {
    render(<ReviewDrawer {...base} mode="morning" tasks={[
      task({ id: 'w1', title: 'Week thing', bucket: 'week' }),
    ]} />)
    expect(screen.getByText(/This week · 1/)).toBeInTheDocument()
    expect(screen.getByText('Week thing')).toBeInTheDocument()
    // The week pool never offers "This wk" — it is already there.
    const weekRow = screen.getByText('Week thing').closest('li')!
    expect(within(weekRow).queryByRole('button', { name: 'This wk' })).toBeNull()
  })

  it('keeps the month pool collapsed — a count you can open, not part of the review', async () => {
    const { user } = render(<ReviewDrawer {...base} mode="morning" tasks={[
      task({ id: 'm1', title: 'Month thing', bucket: 'month' }),
      task({ id: 'm2', title: 'Other month thing', bucket: 'month' }),
    ]} />)
    // Collapsed by default: the count is visible, the rows are not.
    const toggle = screen.getByRole('button', { name: /This month · 2/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Month thing')).not.toBeInTheDocument()
    // Opening it reveals the rows, with their verdicts.
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Month thing')).toBeInTheDocument()
    const row = screen.getByText('Month thing').closest('li')!
    expect(within(row).getByRole('button', { name: 'Today' })).toBeInTheDocument()
    // And it closes again.
    await user.click(toggle)
    expect(screen.queryByText('Month thing')).not.toBeInTheDocument()
  })

  it('offers Delete only when a delete handler exists', () => {
    const { rerender } = render(<ReviewDrawer {...base} mode="morning"
      attentionItems={[attn(task({ id: 's', title: 'Old thing' }), 9)]} />)
    expect(screen.queryByRole('button', { name: /Delete "Old thing"/ })).toBeNull()
    rerender(<ReviewDrawer {...base} mode="morning" onDeleteTask={vi.fn()}
      attentionItems={[attn(task({ id: 's', title: 'Old thing' }), 9)]} />)
    expect(screen.getByRole('button', { name: /Delete "Old thing"/ })).toBeInTheDocument()
  })
})
