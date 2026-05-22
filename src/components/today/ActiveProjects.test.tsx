import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ActiveProjects } from './ActiveProjects'

const onSelectProject = vi.fn()
const onViewAll = vi.fn()
const onTogglePin = vi.fn()

describe('ActiveProjects', () => {
  it('renders an empty state when there are no active projects', () => {
    render(
      <ActiveProjects
        projects={[]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    expect(screen.getByText(/no active projects/i)).toBeInTheDocument()
  })

  it('renders each project with name and rounded progress percent', () => {
    render(
      <ActiveProjects
        projects={[
          { id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: false },
          { id: 'p2', name: 'Kids room renovation', progress: 30, totalTasks: 10, pinned: false },
        ]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    expect(screen.getByText('Backyard upgrades')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Kids room renovation')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('shows the View all projects CTA', () => {
    render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'X', progress: 0, totalTasks: 0, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    expect(screen.getByRole('button', { name: /view all projects/i })).toBeInTheDocument()
  })

  it('calls onSelectProject when a project row is clicked', async () => {
    const { user } = render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Backyard upgrades' }))
    expect(onSelectProject).toHaveBeenCalledWith('p1')
  })

  it('calls onViewAll when View all is clicked', async () => {
    const { user } = render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'X', progress: 0, totalTasks: 0, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    await user.click(screen.getByRole('button', { name: /view all projects/i }))
    expect(onViewAll).toHaveBeenCalledTimes(1)
  })

  it('calls onTogglePin (not onSelectProject) when the pin button is clicked', async () => {
    onSelectProject.mockClear()
    onTogglePin.mockClear()
    const { user } = render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    await user.click(screen.getByRole('button', { name: /pin backyard upgrades/i }))
    expect(onTogglePin).toHaveBeenCalledWith('p1')
    expect(onSelectProject).not.toHaveBeenCalled()
  })

  it('labels the pin button as Unpin and presses it for a pinned project', () => {
    render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: true }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    const pinBtn = screen.getByRole('button', { name: /unpin backyard upgrades/i })
    expect(pinBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
