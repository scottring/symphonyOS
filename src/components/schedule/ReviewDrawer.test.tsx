import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ReviewDrawer, BACKLOG_SESSION_CAP } from './ReviewDrawer'
import type { Task } from '@/types/task'
import type { AttentionItem } from '@/lib/today/attention'

// The page owns the reflection (TodayView); the drawer is handed it.
const reflection = (over: Record<string, unknown> = {}) => ({
  highlight: '', setHighlight: vi.fn(), notes: '', setNotes: vi.fn(),
  save: vi.fn().mockResolvedValue(true), closeDay: vi.fn().mockResolvedValue(true),
  reviewed: false, loading: false, ...over,
})

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
  reflection: reflection(),
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

  // Friends-and-family walk, 2026-10-08: the review said "+5 older waiting …
  // the whole list lives in the Inbox, under Expired" while the Inbox said
  // "Expired · 1". Expired holds only past-DATED work; most of the backlog
  // had no date at all. The line now names each part in the review's own
  // numbers, and only sends past-dated work to Expired.
  it('names where each part of the backlog lives, in numbers that add up', () => {
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const item = (id: string, reason: AttentionItem['reason'], ageDays: number) =>
      ({ task: task({ id, title: id }), reason, ageDays } as AttentionItem)
    render(<ReviewDrawer {...base} mode="morning"
      overdueTasks={[task({ id: 'carried', title: 'carried', scheduledFor: yesterday })]}
      attentionItems={[
        item('w1', 'stranded-week', 20), item('w2', 'stranded-week', 21), item('w3', 'stranded-week', 22), item('w4', 'stranded-week', 23),
        item('m1', 'aging-month', 50), item('m2', 'aging-month', 60), item('m3', 'aging-month', 70),
        item('i1', 'aging-inbox', 30), item('i2', 'aging-inbox', 40),
      ]} />)
    const line = screen.getByText(/older waiting/)
    expect(line).toHaveTextContent('+5 older waiting — five a session keeps it honest. Of the 10 here: 1 past its date — in the Inbox under Expired; 9 with no date that sat a while (4 on a week that has passed, 3 on a month list for 45+ days, 2 in the Inbox for 2+ weeks).')
    expect(line).not.toHaveTextContent(/whole list/i)
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

// Friends-and-family walk, 2026-10-08: "Close the day" saved and dismissed,
// back to an unchanged Today — no "saved", no lasting status, no next step.
describe('ReviewDrawer — closing the day says what happened', () => {
  it('confirms the save, says truthfully what closing changed, and offers a next step', async () => {
    const r = reflection({ highlight: 'Bike ride' })
    const onClose = vi.fn(); const onLookAtTomorrow = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="evening" reflection={r} onClose={onClose} onLookAtTomorrow={onLookAtTomorrow} />)
    await user.click(screen.getByRole('button', { name: 'Close the day' }))
    expect(r.closeDay).toHaveBeenCalledOnce()
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Your reflection is saved.')
    expect(status).toHaveTextContent('Today now shows as reviewed. Anything you moved or ticked off was saved as you went; the rest stays where it was.')
    // It does not dismiss itself: the next step is the person's choice.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /Look at tomorrow/ }))
    expect(onLookAtTomorrow).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('a blank reflection still closes the day, without claiming a reflection was saved', async () => {
    const { user } = render(<ReviewDrawer {...base} mode="evening" />)
    await user.click(screen.getByRole('button', { name: 'Close the day' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Today is closed.')
    expect(status).not.toHaveTextContent('reflection is saved')
  })

  it('a failed save keeps the review open and says so', async () => {
    const r = reflection({ closeDay: vi.fn().mockResolvedValue(false) })
    const onClose = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="evening" reflection={r} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close the day' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save the review')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the morning review still just starts the day', async () => {
    const r = reflection(); const onClose = vi.fn()
    const { user } = render(<ReviewDrawer {...base} mode="morning" reflection={r} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Start the day' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(r.closeDay).not.toHaveBeenCalled()
  })
})

it('Escape closes a review with an input focused', async () => {
  const close = vi.fn()
  const { user } = render(<ReviewDrawer {...base} mode="evening" onClose={close} />)
  const fields = screen.getAllByRole('textbox')
  fields[0].focus()
  await user.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
})
