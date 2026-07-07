import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useConvertTaskToProject } from './useConvertTaskToProject'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'

vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))
import { showToast } from '@/hooks/useToast'

const task = {
  id: 't1',
  title: 'Plan the porch rebuild',
  completed: false,
  scheduledFor: null,
  links: [{ url: 'https://example.com', title: 'Inspiration' }],
  phoneNumber: '555-0100',
  subtasks: [{ id: 'sub1', title: 'Measure' }, { id: 'sub2', title: 'Buy lumber' }],
} as unknown as Task

const project = { id: 'p1', name: 'Porch rebuild' } as Project

describe('useConvertTaskToProject', () => {
  const addProject = vi.fn()
  const updateTask = vi.fn()
  const deleteTask = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the project, reparents subtasks, deletes the parent, and returns the project', async () => {
    addProject.mockResolvedValue(project)
    const { result } = renderHook(() =>
      useConvertTaskToProject([task], { addProject, updateTask, deleteTask }),
    )

    const created = await result.current('t1', { name: 'Porch rebuild', context: 'family' })

    expect(created).toEqual(project)
    expect(addProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Porch rebuild', context: 'family', links: task.links, phoneNumber: '555-0100' }),
    )
    expect(updateTask).toHaveBeenCalledWith('sub1', { projectId: 'p1', parentTaskId: undefined })
    expect(updateTask).toHaveBeenCalledWith('sub2', { projectId: 'p1', parentTaskId: undefined })
    expect(deleteTask).toHaveBeenCalledWith('t1')
    expect(showToast).toHaveBeenCalledWith('Project "Porch rebuild" created', 'success')
  })

  it('returns null and toasts an error when project creation fails, without destructive ops', async () => {
    addProject.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useConvertTaskToProject([task], { addProject, updateTask, deleteTask }),
    )

    const created = await result.current('t1', { name: 'Porch rebuild' })

    expect(created).toBeNull()
    expect(deleteTask).not.toHaveBeenCalled()
    expect(updateTask).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Could not create the project. Please try again.', 'error')
  })

  it('returns null when the task id is unknown', async () => {
    const { result } = renderHook(() =>
      useConvertTaskToProject([task], { addProject, updateTask, deleteTask }),
    )

    const created = await result.current('missing', { name: 'X' })

    expect(created).toBeNull()
    expect(addProject).not.toHaveBeenCalled()
  })
})
