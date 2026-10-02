import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { Task } from '@/types/task'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

const toastSpy = vi.fn()
vi.mock('@/hooks/useToast', () => ({ showToast: (...a: unknown[]) => toastSpy(...a) }))

import { PartOfGoalControl } from './PartOfGoalControl'

const mk = (over: Partial<Task>): Task => ({ id: 'x', title: 'x', completed: false, createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), ...over } as Task)
const task = mk({ id: 't1', title: 'Buy running shoes', bucket: 'week' })
const fall = mk({ id: 'g-fall', title: 'Get fit this fall', isGoal: true, bucket: 'quarter', seasonStart: new Date(2026, 8, 1) })
const oct = mk({ id: 'g-oct', title: 'Run a 10K', isGoal: true, bucket: 'month', monthStart: new Date(2026, 9, 1) })
const done = mk({ id: 'g-done', title: 'Finished goal', isGoal: true, bucket: 'month', monthStart: new Date(2026, 8, 1), completed: true })
const plain = mk({ id: 'p', title: 'Not a goal', bucket: 'month', monthStart: new Date(2026, 9, 1) })
const work = mk({ id: 'g-work', title: 'Ship the report', isGoal: true, bucket: 'month', monthStart: new Date(2026, 9, 1), context: 'work' })

function setup(over: Partial<Task> = {}, opts: { choiceTasks?: Task[]; outcome?: { status: 'ok' } | { status: 'conflict'; currentGoalId: string | null } } = {}) {
  const t = { ...task, ...over }
  const all = [t, fall, oct, done, plain, work]
  const setGoalLink = vi.fn(async () => opts.outcome ?? ({ status: 'ok' } as const))
  const onOpenGoal = vi.fn()
  render(<PartOfGoalControl task={t} tasks={all} choiceTasks={opts.choiceTasks ?? all} seasons={DEFAULT_SEASONS} setGoalLink={setGoalLink} onOpenGoal={onOpenGoal} />)
  return { setGoalLink, onOpenGoal }
}

describe('Part of… in task details (walkthrough 2026-10-02, #26)', () => {
  beforeEach(() => toastSpy.mockClear())

  it('offers open goal tasks grouped by period — not done goals, not plain tasks, not the task itself', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Part of a goal…/ }))
    const menu = screen.getByRole('menu', { name: 'Part of which goal' })
    expect(within(within(menu).getByRole('group', { name: 'Season goals' })).getByRole('menuitemradio', { name: /Get fit this fall/ })).toBeInTheDocument()
    expect(within(within(menu).getByRole('group', { name: 'Month goals' })).getByRole('menuitemradio', { name: /Run a 10K/ })).toBeInTheDocument()
    expect(within(menu).queryByText('Finished goal')).toBeNull()
    expect(within(menu).queryByText('Not a goal')).toBeNull()
    // Nothing to remove yet.
    expect(within(menu).queryByRole('menuitemradio', { name: /None/ })).toBeNull()
  })

  it('offers only the goals in the life areas in view', () => {
    setup({}, { choiceTasks: [task, fall, oct] })
    fireEvent.click(screen.getByRole('button', { name: /Part of a goal…/ }))
    expect(screen.queryByText('Ship the report')).toBeNull()
  })

  it('links through setGoalLink, from the link it had, and says so with Undo', async () => {
    const { setGoalLink } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Part of a goal…/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Run a 10K/ }))
    expect(setGoalLink).toHaveBeenCalledWith('t1', 'g-oct', null)
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    expect(toastSpy.mock.calls[0][0]).toBe('“Buy running shoes” is part of “Run a 10K” now.')
    ;(toastSpy.mock.calls[0][3] as { onClick: () => void }).onClick()
    expect(setGoalLink).toHaveBeenLastCalledWith('t1', null, 'g-oct')
  })

  it('names the goal it is part of, opens it, and can change or remove it', async () => {
    const { setGoalLink, onOpenGoal } = setup({ goalTaskId: 'g-oct' })
    expect(screen.getByText('Part of')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '“Run a 10K”' }))
    expect(onOpenGoal).toHaveBeenCalledWith('g-oct')
    fireEvent.click(screen.getByRole('button', { name: /Change which goal Buy running shoes is part of/ }))
    expect(screen.getByRole('menuitemradio', { name: /Run a 10K/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /None/ }))
    expect(setGoalLink).toHaveBeenCalledWith('t1', null, 'g-oct')
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    expect(toastSpy.mock.calls[0][0]).toMatch(/is no longer a next action for that goal/)
  })

  it('reports a change someone else made, never overwriting it', async () => {
    setup({}, { outcome: { status: 'conflict', currentGoalId: 'g-fall' } })
    fireEvent.click(screen.getByRole('button', { name: /Part of a goal…/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Run a 10K/ }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    expect(toastSpy.mock.calls[0][0]).toMatch(/^Not changed: someone else moved/)
  })

  it('is not offered on a goal; a completed task only says what it was part of', () => {
    const { container } = render(<PartOfGoalControl task={fall} tasks={[fall]} choiceTasks={[fall]} seasons={DEFAULT_SEASONS} setGoalLink={vi.fn()} onOpenGoal={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    setup({ completed: true, goalTaskId: 'g-oct' })
    expect(screen.getByRole('button', { name: '“Run a 10K”' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Change which goal/ })).toBeNull()
  })
})
