import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompletedTasksView } from './CompletedTasksView'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'

// Projects are hidden from the product (2026-09-02 — see the note in
// Sidebar.tsx). History is a live Library page, so its rows must stop naming a
// project — and its search must stop matching one, or typing "Backyards" would
// return rows with no visible reason for matching.
const project = { id: 'proj', name: 'Backyards' } as Project

function completedTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Weed the backyard',
    completed: true,
    projectId: 'proj',
    updatedAt: new Date(2026, 7, 20, 12, 0, 0),
    createdAt: new Date(2026, 7, 19, 12, 0, 0),
    ...overrides,
  } as Task
}

function renderHistory(tasks: Task[] = [completedTask()]) {
  const onSelectTask = vi.fn()
  render(
    <CompletedTasksView
      tasks={tasks}
      contactsMap={new Map<string, Contact>()}
      projectsMap={new Map<string, Project>([['proj', project]])}
      onSelectTask={onSelectTask}
    />,
  )
  return { onSelectTask }
}

describe('CompletedTasksView — Projects hidden', () => {
  it('renders no project name on a row whose task carries a project', () => {
    renderHistory()
    // Positive control — the row really did render.
    expect(screen.getByText('Weed the backyard')).toBeInTheDocument()
    expect(screen.queryByText('Backyards')).not.toBeInTheDocument()
  })

  it('no longer matches a project name in search', () => {
    renderHistory()
    fireEvent.change(screen.getByPlaceholderText('Search completed tasks...'), {
      target: { value: 'Backyards' },
    })
    expect(screen.queryByText('Weed the backyard')).not.toBeInTheDocument()
  })

  it('still matches the task title in search', () => {
    renderHistory([completedTask(), completedTask({ id: 't2', title: 'Book the sitter', projectId: undefined })])
    fireEvent.change(screen.getByPlaceholderText('Search completed tasks...'), {
      target: { value: 'sitter' },
    })
    expect(screen.getByText('Book the sitter')).toBeInTheDocument()
    expect(screen.queryByText('Weed the backyard')).not.toBeInTheDocument()
  })
})
