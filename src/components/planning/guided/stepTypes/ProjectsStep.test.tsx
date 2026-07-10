import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { ProjectsStep } from './ProjectsStep'
import { renderStep, makeHost } from './testHarness'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

const step = {
  id: 'projects-in-motion', type: 'projects' as const, title: 'Projects in motion',
  narration: 'These are the projects you have in motion, with what is still open in each.',
}

const proj = (over: Record<string, unknown>) =>
  ({ id: 'p', name: 'Project', status: 'in_progress', ...over }) as unknown as Project
const task = (over: Record<string, unknown>) =>
  ({ id: 't', title: 'Task', completed: false, createdAt: new Date(), updatedAt: new Date(), ...over }) as unknown as Task

describe('ProjectsStep', () => {
  it('lists active projects with open counts, biggest first', () => {
    const host = makeHost({
      projects: [proj({ id: 'p1', name: 'Kitchen' }), proj({ id: 'p2', name: 'Trip' })],
      tasks: [
        task({ id: 'a', projectId: 'p2' }),
        task({ id: 'b', projectId: 'p2' }),
        task({ id: 'c', projectId: 'p1' }),
        task({ id: 'd', projectId: 'p1', completed: true }),
      ],
    })
    renderStep(<ProjectsStep />, { step, host })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Trip')
    expect(items[0]).toHaveTextContent('2 open')
    expect(items[1]).toHaveTextContent('Kitchen')
    expect(items[1]).toHaveTextContent('1 open')
  })

  it('hides completed projects and empty on-hold ones; shows on-hold with open work', () => {
    const host = makeHost({
      projects: [
        proj({ id: 'p1', name: 'Done thing', status: 'completed' }),
        proj({ id: 'p2', name: 'Parked empty', status: 'on_hold' }),
        proj({ id: 'p3', name: 'Parked busy', status: 'on_hold' }),
      ],
      tasks: [task({ id: 'a', projectId: 'p3' })],
    })
    renderStep(<ProjectsStep />, { step, host })
    expect(screen.queryByText('Done thing')).toBeNull()
    expect(screen.queryByText('Parked empty')).toBeNull()
    expect(screen.getByText('Parked busy')).toBeInTheDocument()
    expect(screen.getByText(/on hold · 1 open/)).toBeInTheDocument()
  })

  it('quiet empty state', () => {
    renderStep(<ProjectsStep />, { step, host: makeHost() })
    expect(screen.getByText(/No projects in motion/)).toBeInTheDocument()
  })
})
