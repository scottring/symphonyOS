import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { AddExistingActionDialog } from './AddExistingActionDialog'
import type { Task } from '@/types/task'

const at = (d: string) => new Date(`${d}T12:00:00`)
const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, title, completed: false, createdAt: at('2026-09-01'), updatedAt: at('2026-09-01'), bucket: 'inbox', ...over,
} as Task)
const GOAL = task('g1', 'Identify family activities for fall', { isGoal: true, bucket: 'month', scope: 'compound', context: 'family' })
const OTHER = task('g2', 'Get the house ready for winter', { isGoal: true, bucket: 'quarter' })

function renderDialog(tasks: Task[], onLink = vi.fn(async () => true)) {
  const onClose = vi.fn()
  render(<AddExistingActionDialog goal={GOAL} tasks={[GOAL, OTHER, ...tasks]} onLink={onLink} onClose={onClose} />)
  return { onLink, onClose }
}

describe('AddExistingActionDialog', () => {
  it('files a free action in one choice — the example: "Look up music lessons"', async () => {
    const user = userEvent.setup()
    const { onLink } = renderDialog([task('a', 'Look up music lessons', { bucket: 'week', weekStart: at('2026-10-05') }), task('b', 'Buy stain')])
    const search = screen.getByRole('searchbox', { name: 'Search your actions' })
    expect(search).toHaveFocus()
    await user.type(search, 'music')
    expect(within(screen.getByRole('list', { name: 'Actions' })).getAllByRole('button')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /Look up music lessons — Week of Oct 5/ }))
    expect(onLink).toHaveBeenCalledWith('a')
    expect(screen.getByRole('status')).toHaveTextContent('Added “Look up music lessons”.')
  })

  it('an action already here is shown, marked, and cannot be added twice', async () => {
    const user = userEvent.setup()
    const { onLink } = renderDialog([task('a', 'Look up music lessons', { goalTaskId: 'g1' })])
    const row = screen.getByRole('button', { name: /already a next action for this goal/ })
    expect(row).toBeDisabled()
    expect(screen.getByText('Already here')).toBeInTheDocument()
    await user.click(row)
    expect(onLink).not.toHaveBeenCalled()
  })

  it('an action under another goal needs an explicit move — "Keep it where it is" changes nothing', async () => {
    const user = userEvent.setup()
    const { onLink } = renderDialog([task('a', 'Look up swim lessons', { goalTaskId: 'g2' })])
    await user.click(screen.getByRole('button', { name: /now under Get the house ready for winter/ }))
    expect(onLink).not.toHaveBeenCalled()
    const move = screen.getByRole('group', { name: 'Move this action' })
    expect(move).toHaveTextContent('is a next action for Get the house ready for winter')
    await user.click(within(move).getByRole('button', { name: 'Keep it where it is' }))
    expect(onLink).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /now under Get the house ready for winter/ }))
    await user.click(screen.getByRole('button', { name: 'Move it to Identify family activities for fall' }))
    expect(onLink).toHaveBeenCalledWith('a')
  })

  it('says so when the save fails, and claims nothing', async () => {
    const user = userEvent.setup()
    renderDialog([task('a', 'Look up music lessons')], vi.fn(async () => false))
    await user.click(screen.getByRole('button', { name: /Look up music lessons/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not add “Look up music lessons”. Nothing was changed')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('tells two identical titles apart', () => {
    renderDialog([task('a', 'Look up music lessons', { createdAt: at('2026-08-02') }), task('b', 'Look up music lessons', { createdAt: at('2026-09-14'), context: 'family' })])
    expect(screen.getByText(/Added Aug 2, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Family · Added Sep 14, 2026/)).toBeInTheDocument()
  })

  it('a long list is bounded and counted', () => {
    renderDialog(Array.from({ length: 120 }, (_, i) => task(`t${i}`, `Errand ${i}`)))
    expect(screen.getByText('Showing 50 of 120. Keep typing to narrow it down.')).toBeInTheDocument()
  })

  it('works from the keyboard: Tab from the search to a result, Enter files it, Escape closes', async () => {
    const user = userEvent.setup()
    const { onLink, onClose } = renderDialog([task('a', 'Look up music lessons')])
    await user.tab()
    expect(screen.getByRole('button', { name: /Look up music lessons/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onLink).toHaveBeenCalledWith('a')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
