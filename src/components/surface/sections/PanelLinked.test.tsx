import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLinked } from './PanelLinked'
import { createMockProject, createMockTask } from '@/test/mocks/factories'

describe('PanelLinked', () => {
  const handlers = {
    onOpenProject: vi.fn(),
    onOpenEvent: vi.fn(),
    onOpenTask: vi.fn(),
  }

  it('renders nothing when no links', () => {
    const { container } = render(<PanelLinked siblingTasks={[]} {...handlers} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders project card', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam — Health' })
    render(<PanelLinked project={project} siblingTasks={[]} {...handlers} />)
    expect(screen.getByText('Liam — Health')).toBeInTheDocument()
  })

  it('renders linked event title and time', () => {
    render(<PanelLinked
      linkedEvent={{ id: 'e1', title: 'Annual physical', start_time: '2026-05-14T09:00:00Z' } as any}
      siblingTasks={[]}
      {...handlers}
    />)
    expect(screen.getByText('Annual physical')).toBeInTheDocument()
  })

  it('renders sibling tasks', () => {
    const sib = createMockTask({ id: 't9', title: 'Refill rx' })
    render(<PanelLinked siblingTasks={[sib]} {...handlers} />)
    expect(screen.getByText('Refill rx')).toBeInTheDocument()
  })

  it('calls onOpenProject when project is clicked', async () => {
    const project = createMockProject({ id: 'p1', name: 'Project X' })
    const onOpenProject = vi.fn()
    const { user } = render(<PanelLinked project={project} siblingTasks={[]} {...{ ...handlers, onOpenProject }} />)
    await user.click(screen.getByRole('button', { name: /Project X/ }))
    expect(onOpenProject).toHaveBeenCalledWith('p1')
  })
})
