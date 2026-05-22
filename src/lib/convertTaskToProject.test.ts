import { describe, it, expect, vi } from 'vitest'
import { convertTaskToProject } from './convertTaskToProject'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Plan Q3 launch',
    completed: false,
    bucket: 'inbox',
    createdAt: new Date('2026-05-22T00:00:00Z'),
    updatedAt: new Date('2026-05-22T00:00:00Z'),
    ...overrides,
  } as Task
}

const project: Project = {
  id: 'proj-99',
  name: 'Plan Q3 launch',
  status: 'not_started',
  createdAt: new Date('2026-05-22T00:00:00Z'),
  updatedAt: new Date('2026-05-22T00:00:00Z'),
}

function makeDeps() {
  return {
    addProject: vi.fn().mockResolvedValue(project),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
  }
}

describe('convertTaskToProject', () => {
  it('creates a project and carries over notes, links, phone, and context', async () => {
    const deps = makeDeps()
    const task = makeTask({
      notes: 'kickoff Q3',
      links: [{ url: 'https://x.test', label: 'brief' } as any],
      phoneNumber: '555-1212',
      context: 'work',
    })

    const result = await convertTaskToProject(
      task,
      { name: 'Plan Q3 launch', notes: 'kickoff Q3', context: 'work' },
      deps,
    )

    expect(result).toBe(project)
    expect(deps.addProject).toHaveBeenCalledWith({
      name: 'Plan Q3 launch',
      notes: 'kickoff Q3',
      context: 'work',
      links: [{ url: 'https://x.test', label: 'brief' }],
      phoneNumber: '555-1212',
    })
  })

  it('re-parents each subtask into the project then deletes the parent', async () => {
    const deps = makeDeps()
    const task = makeTask({
      subtasks: [
        makeTask({ id: 'sub-a', title: 'Buy cake', parentTaskId: 'task-1' }),
        makeTask({ id: 'sub-b', title: 'Send invites', parentTaskId: 'task-1' }),
      ],
    })

    await convertTaskToProject(task, { name: 'Plan Q3 launch' }, deps)

    expect(deps.updateTask).toHaveBeenCalledWith('sub-a', {
      projectId: 'proj-99',
      parentTaskId: undefined,
    })
    expect(deps.updateTask).toHaveBeenCalledWith('sub-b', {
      projectId: 'proj-99',
      parentTaskId: undefined,
    })
    expect(deps.deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('handles a task with no subtasks (empty project, no updates)', async () => {
    const deps = makeDeps()
    const task = makeTask()

    await convertTaskToProject(task, { name: 'Plan Q3 launch' }, deps)

    expect(deps.updateTask).not.toHaveBeenCalled()
    expect(deps.deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('bails safely if project creation fails (no re-parent, no delete)', async () => {
    const deps = makeDeps()
    deps.addProject.mockResolvedValue(null)
    const task = makeTask({
      subtasks: [makeTask({ id: 'sub-a', parentTaskId: 'task-1' })],
    })

    const result = await convertTaskToProject(task, { name: 'X' }, deps)

    expect(result).toBeNull()
    expect(deps.updateTask).not.toHaveBeenCalled()
    expect(deps.deleteTask).not.toHaveBeenCalled()
  })
})
