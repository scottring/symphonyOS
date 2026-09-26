import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Task } from '@/types/task'

const toastSpy = vi.fn()
vi.mock('@/hooks/useToast', () => ({ showToast: (...a: unknown[]) => toastSpy(...a) }))

import { MakeGoalControl } from './MakeGoalControl'

const task = (over: Partial<Task>): Task => ({ id: 't1', title: 'Nourish a love of reading', completed: false, bucket: 'quarter', createdAt: new Date(), updatedAt: new Date(), ...over } as Task)

describe('MakeGoalControl in task details', () => {
  beforeEach(() => toastSpy.mockClear())

  it('converts an eligible task in place, with Undo', async () => {
    const setGoal = vi.fn()
    render(<MakeGoalControl task={task({})} tasks={[]} setGoal={setGoal} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make it a goal' }))
    expect(setGoal).toHaveBeenCalledWith('t1', true)
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    ;(toastSpy.mock.calls[0][3] as { onClick: () => void }).onClick()
    expect(setGoal).toHaveBeenLastCalledWith('t1', false)
  })

  it('explains, and writes nothing, when the task cannot be a goal', () => {
    const setGoal = vi.fn()
    render(<MakeGoalControl task={task({ bucket: 'week' })} tasks={[]} setGoal={setGoal} />)
    const button = screen.getByRole('button', { name: 'Make it a goal' })
    fireEvent.click(button)
    expect(setGoal).not.toHaveBeenCalled()
    const reason = screen.getByRole('status')
    expect(reason).toHaveTextContent(/Only something on a month or season list/)
    expect(button).toHaveAttribute('aria-describedby', reason.id)
  })

  it('names the goal a step belongs to', () => {
    render(<MakeGoalControl task={task({ goalTaskId: 'g1' })} tasks={[{ id: 'g1', title: 'Read together' } as Task]} setGoal={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make it a goal' }))
    expect(screen.getByRole('status')).toHaveTextContent('a step of “Read together”')
  })

  it('is not offered on a goal or a finished task', () => {
    const { rerender } = render(<MakeGoalControl task={task({ isGoal: true })} tasks={[]} setGoal={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Make it a goal' })).toBeNull()
    rerender(<MakeGoalControl task={task({ completed: true })} tasks={[]} setGoal={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Make it a goal' })).toBeNull()
  })
})
