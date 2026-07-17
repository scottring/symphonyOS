import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { EndOfDayReview } from './EndOfDayReview'
import type { Task } from '@/types/task'

vi.mock('@/hooks/useEveningReflection', () => ({
  useEveningReflection: () => ({
    highlight: '', setHighlight: vi.fn(), notes: '', setNotes: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined), loading: false,
  }),
}))

const today = new Date()
const task = (p: Partial<Task>): Task => ({ id: 'x', title: 't', completed: false, ...p } as Task)

const base = { isOpen: true as const, onClose: vi.fn(), viewedDate: today, onUpdateTask: vi.fn() }

describe('EndOfDayReview', () => {
  it("celebrates today's completed tasks", () => {
    render(<EndOfDayReview {...base} tasks={[
      task({ id: 'a', title: 'Did A', completed: true, scheduledFor: today }),
      task({ id: 'b', title: 'Did B', completed: true, scheduledFor: today }),
    ]} />)
    expect(screen.getByText(/You closed 2 things today/)).toBeInTheDocument()
    expect(screen.getByText('Did A')).toBeInTheDocument()
  })

  it('pushes an unfinished item to tomorrow', async () => {
    const onUpdateTask = vi.fn()
    const { user } = render(<EndOfDayReview {...base} onUpdateTask={onUpdateTask} tasks={[
      task({ id: 'u', title: 'Call plumber', completed: false, scheduledFor: today }),
    ]} />)
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Tomorrow/ }))
    expect(onUpdateTask).toHaveBeenCalledWith('u', expect.objectContaining({ bucket: 'timed' }))
    expect(screen.getByText('tomorrow')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(<EndOfDayReview {...base} isOpen={false} tasks={[]} />)
    expect(screen.queryByText('End of day')).not.toBeInTheDocument()
  })
})
