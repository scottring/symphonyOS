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

const task = (p: Partial<Task>): Task => ({ id: 'x', title: 't', completed: false, ...p } as Task)
const attn = (t: Task, ageDays: number): AttentionItem =>
  ({ task: t, reason: 'slipped', ageDays } as AttentionItem)

const base = {
  isOpen: true as const,
  onClose: vi.fn(),
  viewedDate: today,
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

describe('ReviewDrawer — a loose end can be closed, not only postponed', () => {
  it('ticking an unfinished task completes it instead of pushing it', async () => {
    const onCompleteTask = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="evening" onCompleteTask={onCompleteTask} tasks={[
      task({ id: 'u', title: 'Never got to it', scheduledFor: today }),
    ]} />)
    const row = screen.getByText('Never got to it').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Complete "Never got to it"' }))
    expect(onCompleteTask).toHaveBeenCalledWith('u')
    expect(within(row).getByText('done')).toBeInTheDocument()
    // And the Tomorrow verb is gone — the row is resolved either way.
    expect(within(row).queryByRole('button', { name: /Tomorrow/ })).not.toBeInTheDocument()
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

  it('caps the backlog at the session cap, NEWEST first, and says how many wait', () => {
    const items = Array.from({ length: BACKLOG_SESSION_CAP + 3 }, (_, i) =>
      attn(task({ id: `s${i}`, title: `Slipped ${i}` }), 10 + i))
    render(<ReviewDrawer {...base} mode="morning" attentionItems={items} />)
    // Youngest (lowest age) render; the oldest three wait — they're in the
    // Inbox's Expired section, which is where a long list belongs.
    expect(screen.getByText('Slipped 0')).toBeInTheDocument()
    expect(screen.queryByText(`Slipped ${BACKLOG_SESSION_CAP + 2}`)).not.toBeInTheDocument()
    expect(screen.getByText(/\+3 older waiting/)).toBeInTheDocument()
  })

  // The reported bug: Review was the only door to a carried-over task, and
  // oldest-first buried yesterday's slip behind a wall of ancient ones — so
  // "Respond to Christian", one day old, was reachable from nowhere.
  it("puts yesterday's carry-over in front of a 25-day-old item", () => {
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const longAgo = new Date(today); longAgo.setDate(longAgo.getDate() - 25)
    render(<ReviewDrawer {...base} mode="morning" overdueTasks={[
      task({ id: 'old', title: 'Brainstorm vacation ideas', scheduledFor: longAgo }),
      task({ id: 'new', title: 'Respond to Christian', scheduledFor: yesterday }),
    ]} />)
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(titles[0]).toContain('Respond to Christian')
    expect(titles[1]).toContain('Brainstorm vacation ideas')
  })

  // "we need a completed checkbox for the review modal" — Scott, 2026-09-03.
  // Half of what is in this drawer is work you already did and never ticked
  // off; without this the only honest fates were to reschedule it or delete
  // it, and deleting loses that it happened.
  it('a backlog row can be marked done, not just rescheduled', async () => {
    const onCompleteTask = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="morning" onCompleteTask={onCompleteTask}
      attentionItems={[attn(task({ id: 's', title: 'Old thing' }), 100)]} />)
    const row = screen.getByText('Old thing').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Complete "Old thing"' }))
    expect(onCompleteTask).toHaveBeenCalledWith('s')
    expect(within(row).getByText('done')).toBeInTheDocument()
  })

  it('offers no checkbox when the surface has no completion handler', () => {
    render(<ReviewDrawer {...base} mode="morning"
      attentionItems={[attn(task({ id: 's', title: 'Old thing' }), 100)]} />)
    expect(screen.queryByRole('button', { name: 'Complete "Old thing"' })).not.toBeInTheDocument()
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

  it('never shows the week or month pools — those are header dropdowns, not review material', () => {
    render(<ReviewDrawer {...base} mode="morning" tasks={[
      task({ id: 'w1', title: 'Week thing', bucket: 'week' }),
      task({ id: 'm1', title: 'Month thing', bucket: 'month' }),
    ]} />)
    expect(screen.queryByText(/This week/)).not.toBeInTheDocument()
    expect(screen.queryByText('Week thing')).not.toBeInTheDocument()
    expect(screen.queryByText(/This month/)).not.toBeInTheDocument()
    expect(screen.queryByText('Month thing')).not.toBeInTheDocument()
    // With no backlog either, the morning review is honestly empty.
    expect(screen.getByText(/Nothing waiting/)).toBeInTheDocument()
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
