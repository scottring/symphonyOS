import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectControl } from './ProjectControl'

const project = (id: string, name: string) => ({
  id,
  name,
  status: 'in_progress' as const,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
})

describe('ProjectControl — create-new path', () => {
  it('shows "+ Create new project…" entry when onCreate is provided', () => {
    render(
      <ProjectControl
        projects={[project('p1', 'Backyard reno')]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={vi.fn()}
        defaultNewName="Look into bike storage"
      />,
    )
    // open the dropdown
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    expect(screen.getByText(/Create new project/i)).toBeInTheDocument()
  })

  it('does NOT show "+ Create new project…" when onCreate is not provided', () => {
    render(
      <ProjectControl
        projects={[project('p1', 'Backyard reno')]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    expect(screen.queryByText(/Create new project/i)).not.toBeInTheDocument()
  })

  it('expands inline form prefilled with defaultNewName when "+ Create" is tapped', () => {
    render(
      <ProjectControl
        projects={[]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={vi.fn()}
        defaultNewName="Bike storage ideas"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    fireEvent.click(screen.getByText(/Create new project/i))
    const input = screen.getByLabelText(/project name/i) as HTMLInputElement
    expect(input.value).toBe('Bike storage ideas')
  })

  it('calls onCreate with the trimmed name and selected context on submit', () => {
    const onCreate = vi.fn()
    render(
      <ProjectControl
        projects={[]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={onCreate}
        defaultNewName="  Bike storage  "
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    fireEvent.click(screen.getByText(/Create new project/i))
    fireEvent.click(screen.getByRole('button', { name: /context: family/i }))
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreate).toHaveBeenCalledWith('Bike storage', 'family')
  })

  it('does not call onCreate when the name input is empty', () => {
    const onCreate = vi.fn()
    render(
      <ProjectControl
        projects={[]}
        onAssign={vi.fn()}
        onClear={vi.fn()}
        onCreate={onCreate}
        defaultNewName=""
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign project/i }))
    fireEvent.click(screen.getByText(/Create new project/i))
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })
})
