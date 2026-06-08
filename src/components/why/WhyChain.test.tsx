import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WhyChain } from './WhyChain'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Goal } from '@/types/goal'

const task = (over: Partial<Task>): Task => ({
  id: 't1', title: 't', completed: false, bucket: 'inbox', scheduledFor: undefined, isAllDay: true,
  context: null, assignedTo: null, assignedToAll: [], createdAt: new Date(), updatedAt: new Date(),
  ...(over as Task),
})

const project = (over: Partial<Project>): Project => ({ id: 'p1', name: 'Backyard', ...(over as Project) })

const goal = (over: Partial<Goal>): Goal => ({
  id: 'g1', areaId: 'a1', name: 'Make the home calm', year: 2026, status: 'active', sortOrder: 0,
  actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(), ...(over as Goal),
})

describe('WhyChain', () => {
  it('renders nothing when the task has no project', () => {
    const { container } = render(<WhyChain task={task({ projectId: undefined })} projects={[]} goals={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the project is not found', () => {
    const { container } = render(<WhyChain task={task({ projectId: 'missing' })} projects={[project({})]} goals={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the project when present (no goal)', () => {
    render(<WhyChain task={task({ projectId: 'p1' })} projects={[project({})]} goals={[]} />)
    expect(screen.getByText('Backyard')).toBeInTheDocument()
    expect(screen.queryByText('Make the home calm')).not.toBeInTheDocument()
  })

  it('shows project + goal when a goal references the project', () => {
    const g = goal({ actions: [{ id: 'ga1', goalId: 'g1', title: 'x', projectId: 'p1' }] })
    render(<WhyChain task={task({ projectId: 'p1' })} projects={[project({})]} goals={[g]} />)
    expect(screen.getByText('Backyard')).toBeInTheDocument()
    expect(screen.getByText('Make the home calm')).toBeInTheDocument()
  })

  it('fires open handlers', async () => {
    const onOpenProject = vi.fn(); const onOpenGoal = vi.fn()
    const g = goal({ actions: [{ id: 'ga1', goalId: 'g1', title: 'x', projectId: 'p1' }] })
    const { user } = render(
      <WhyChain task={task({ projectId: 'p1' })} projects={[project({})]} goals={[g]}
        onOpenProject={onOpenProject} onOpenGoal={onOpenGoal} />
    )
    await user.click(screen.getByText('Backyard'))
    expect(onOpenProject).toHaveBeenCalledWith('p1')
    await user.click(screen.getByText('Make the home calm'))
    expect(onOpenGoal).toHaveBeenCalledWith('g1')
  })
})
