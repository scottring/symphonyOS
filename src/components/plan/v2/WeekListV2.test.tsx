import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekListV2 } from './WeekListV2'
import type { Task } from '@/types/task'
import type { LineActions } from './PlanLine'

const task = (x: Partial<Task>): Task => ({ id: 't', title: 'T', completed: false, createdAt: new Date(), updatedAt: new Date(), ...x }) as Task
const actions = { done: vi.fn(), carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as unknown as LineActions
const base = { title: 'This week’s list', weekStart: new Date(2026, 8, 27), members: [], actions, onContext: vi.fn(), onAdd: vi.fn() }

describe('WeekListV2 — a child of a month line', () => {
  it('"+ Next step" opens the row on the week’s list, naming its month line; Enter adds it', () => {
    const onDraftChild = vi.fn(), onCancelChild = vi.fn()
    render(<WeekListV2 {...base} lines={[]} parentOf={() => null}
      draftChild={{ id: 'g', title: 'Hang porch plants', isGoal: true }} onDraftChild={onDraftChild} onCancelChild={onCancelChild} />)
    expect(screen.getByText(/Step toward “Hang porch plants”/)).toBeTruthy()
    const input = screen.getByLabelText('Next step toward Hang porch plants')
    fireEvent.change(input, { target: { value: 'Buy hooks' } })
    fireEvent.submit(input.closest('form')!)
    expect(onDraftChild).toHaveBeenCalledWith('Buy hooks')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancelChild).toHaveBeenCalled()
  })

  it('a row names the month line it came from, lights it on hover, and shows it on click', () => {
    const onHoverParent = vi.fn(), onShowParent = vi.fn()
    const step = task({ id: 's', title: 'Buy hooks', goalTaskId: 'g' })
    render(<WeekListV2 {...base} lines={[{ task: step, fate: 'open', partOf: null, where: null }]}
      parentOf={(t) => (t.goalTaskId === 'g' ? { id: 'g', title: 'Hang porch plants', isGoal: true } : null)}
      onHoverParent={onHoverParent} onShowParent={onShowParent} />)
    const row = screen.getByText('Buy hooks').closest('li')!
    fireEvent.mouseEnter(row)
    expect(onHoverParent).toHaveBeenLastCalledWith('g')
    fireEvent.click(screen.getByRole('button', { name: /Step toward Hang porch plants/ }))
    expect(onShowParent).toHaveBeenCalledWith('g')
    fireEvent.mouseLeave(row)
    expect(onHoverParent).toHaveBeenLastCalledWith(null)
  })
})
