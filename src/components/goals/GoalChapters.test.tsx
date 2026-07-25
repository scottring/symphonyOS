import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { GoalChapters } from './GoalChapters'
import type { Task } from '@/types/task'

const pick = (id: string, title: string, over: Partial<Task> = {}): Task =>
  ({ id, title, completed: false, createdAt: new Date(2026, 6, 5), pickedAt: new Date(2026, 6, 5), bucket: 'quarter', goalId: 'g1', ...over }) as Task

describe('GoalChapters', () => {
  it('lists one chapter per season PICK with its state', () => {
    render(<GoalChapters goalId="g1" tasks={[
      pick('b1', 'Money plan drafted', { pickedAt: new Date(2026, 3, 2), completed: true }),
      pick('b2', 'A money plan we follow'),
    ]} />)
    expect(screen.getByText(/Spring 2026/)).toBeInTheDocument()
    expect(screen.getByText('Money plan drafted')).toBeInTheDocument()
    expect(screen.getByText(/Summer 2026/)).toBeInTheDocument()
  })

  it('renders nothing when the goal has no picks (shelf items make no chapter)', () => {
    const shelved = pick('b3', 'Never chosen', { pickedAt: undefined })
    const { container } = render(<GoalChapters goalId="g1" tasks={[shelved]} />)
    expect(container.firstChild).toBeNull()
  })
})
