import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { UsView } from './UsView'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'

const now = new Date(2026, 5, 8, 9, 0, 0) // Mon Jun 8

const task = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), title: 't', completed: false, bucket: 'inbox',
  scheduledFor: undefined, isAllDay: true, context: null, assignedTo: null, assignedToAll: [],
  createdAt: new Date(), updatedAt: new Date(), ...(over as Task),
})

const members: FamilyMember[] = [
  { id: 'sk', name: 'Scott' } as FamilyMember,
  { id: 'ir', name: 'Iris' } as FamilyMember,
]

describe('UsView', () => {
  it('shows only shared (couple/compound) tasks under "Who\'s got what"', () => {
    const tasks = [
      task({ title: 'Private work thing', scope: 'individual', assignedTo: 'sk' }),
      task({ title: 'Shared couple thing', scope: 'couple', assignedTo: 'sk' }),
      task({ title: 'Family chore', scope: 'compound', assignedTo: 'ir' }),
    ]
    render(<UsView tasks={tasks} events={[]} members={members} now={now} onSelectTask={vi.fn()} />)
    expect(screen.getByText('Shared couple thing')).toBeInTheDocument()
    expect(screen.getByText('Family chore')).toBeInTheDocument()
    expect(screen.queryByText('Private work thing')).not.toBeInTheDocument()
  })

  it('"Needs us" surfaces shared items flagged needs_discussion', () => {
    const tasks = [
      task({ title: 'Talk about budget', scope: 'couple', needsDiscussion: true, assignedTo: 'sk' }),
      task({ title: 'Quiet shared task', scope: 'couple', needsDiscussion: false }),
    ]
    render(<UsView tasks={tasks} events={[]} members={members} now={now} onSelectTask={vi.fn()} />)
    expect(screen.getByText(/Needs us \(1\)/)).toBeInTheDocument()
    // Appears in "Needs us" and also under "Who's got what" — both are correct.
    expect(screen.getAllByText('Talk about budget').length).toBeGreaterThanOrEqual(1)
  })

  it('groups delegation by assignee with names', () => {
    const tasks = [
      task({ title: 'A', scope: 'compound', assignedToAll: ['ir'] }),
      task({ title: 'B', scope: 'compound', assignedToAll: ['ir'] }),
      task({ title: 'C', scope: 'couple', assignedTo: 'sk' }),
    ]
    render(<UsView tasks={tasks} events={[]} members={members} now={now} onSelectTask={vi.fn()} />)
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('Scott')).toBeInTheDocument()
  })

  it('selecting a shared task fires onSelectTask', async () => {
    const onSelectTask = vi.fn()
    const tasks = [task({ id: 'x1', title: 'Shared thing', scope: 'couple', assignedTo: 'sk' })]
    const { user } = render(<UsView tasks={tasks} events={[]} members={members} now={now} onSelectTask={onSelectTask} />)
    await user.click(screen.getByText('Shared thing'))
    expect(onSelectTask).toHaveBeenCalledWith('x1')
  })

  it('shows calm empty states when nothing is shared', () => {
    render(<UsView tasks={[task({ scope: 'individual' })]} events={[]} members={members} now={now} onSelectTask={vi.fn()} />)
    expect(screen.getByText(/Nothing flagged for the two of you/)).toBeInTheDocument()
    expect(screen.getByText(/Tag a task "couple" or "family"/)).toBeInTheDocument()
  })
})
