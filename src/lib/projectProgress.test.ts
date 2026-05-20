import { describe, it, expect } from 'vitest'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'
import { rankActiveProjects } from './projectProgress'

function mkProject(id: string, name: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name,
    status: 'in_progress',
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  }
}

function mkTask(id: string, projectId: string | null, completed: boolean): Task {
  return {
    id,
    title: `t-${id}`,
    completed,
    scheduledFor: null,
    context: null,
    projectId,
    contactId: null,
    assignedTo: null,
    bucket: 'today',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Task
}

describe('rankActiveProjects', () => {
  it('returns empty when no projects exist', () => {
    expect(rankActiveProjects([], [])).toEqual([])
  })

  it('excludes completed projects from active list', () => {
    const projects = [
      mkProject('a', 'Active'),
      mkProject('b', 'Done', { status: 'completed' }),
    ]
    const result = rankActiveProjects(projects, [])
    expect(result.map((p) => p.id)).toEqual(['a'])
  })

  it('computes progress as completed / total of project tasks', () => {
    const projects = [mkProject('a', 'A')]
    const tasks = [
      mkTask('1', 'a', true),
      mkTask('2', 'a', true),
      mkTask('3', 'a', false),
      mkTask('4', 'a', false),
    ]
    const result = rankActiveProjects(projects, tasks)
    expect(result[0].progress).toBe(50)
    expect(result[0].totalTasks).toBe(4)
  })

  it('treats a project with no tasks as 0% progress', () => {
    const projects = [mkProject('a', 'A')]
    const result = rankActiveProjects(projects, [])
    expect(result[0].progress).toBe(0)
    expect(result[0].totalTasks).toBe(0)
  })

  it('rounds progress to nearest integer', () => {
    const projects = [mkProject('a', 'A')]
    const tasks = [
      mkTask('1', 'a', true),
      mkTask('2', 'a', false),
      mkTask('3', 'a', false),
    ]
    const result = rankActiveProjects(projects, tasks)
    expect(result[0].progress).toBe(33)
  })

  it('sorts active projects by recency (updatedAt desc)', () => {
    const projects = [
      mkProject('a', 'Older', { updatedAt: new Date(2026, 0, 1) }),
      mkProject('b', 'Newer', { updatedAt: new Date(2026, 5, 1) }),
      mkProject('c', 'Middle', { updatedAt: new Date(2026, 3, 1) }),
    ]
    const result = rankActiveProjects(projects, [])
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('caps results at the requested limit', () => {
    const projects = Array.from({ length: 10 }, (_, i) => mkProject(`p${i}`, `P${i}`))
    const result = rankActiveProjects(projects, [], 3)
    expect(result).toHaveLength(3)
  })

  it('exposes the project name', () => {
    const result = rankActiveProjects([mkProject('a', 'Backyard upgrades')], [])
    expect(result[0].name).toBe('Backyard upgrades')
  })
})
