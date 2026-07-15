import { describe, it, expect } from 'vitest'
import { computeCoachLines, funRatio, type CoachInput } from './coachLines'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Project } from '@/types/project'

const now = new Date('2026-07-15T12:00:00Z')

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return { completed: false, createdAt: now, updatedAt: now, ...partial } as Task
}
function goal(id: string, name: string, status: Goal['status'] = 'active'): Goal {
  return { id, name, status, areaId: 'a', year: 2026, sortOrder: 0, actions: [], milestones: [], createdAt: now, updatedAt: now }
}
function project(id: string, name: string, status: Project['status'] = 'in_progress'): Project {
  return { id, name, status, createdAt: now, updatedAt: now }
}
function input(partial: Partial<CoachInput>): CoachInput {
  return { stepType: 'narration', tasks: [], goals: [], projects: [], ...partial }
}

describe('review: stale carries', () => {
  it('names items pushed 3+ times', () => {
    const lines = computeCoachLines(input({
      stepType: 'review', bucket: 'week',
      tasks: [
        task({ id: '1', title: 'Kid-safe phone', bucket: 'week', deferCount: 4 }),
        task({ id: '2', title: 'Fresh item', bucket: 'week', deferCount: 0 }),
      ],
    }))
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('stale-carries')
    expect(lines[0].text).toContain('Kid-safe phone')
  })
  it('ignores completed and other-bucket tasks', () => {
    const lines = computeCoachLines(input({
      stepType: 'review', bucket: 'week',
      tasks: [
        task({ id: '1', title: 'done', bucket: 'week', deferCount: 5, completed: true }),
        task({ id: '2', title: 'elsewhere', bucket: 'month', deferCount: 5 }),
      ],
    }))
    expect(lines).toHaveLength(0)
  })
})

describe('look-above goals: season coverage', () => {
  const goals = [goal('g1', 'Firebase rebuild'), goal('g2', 'CrossFit consistency')]
  it('nudges when some goals have no season move', () => {
    const lines = computeCoachLines(input({
      stepType: 'look-above', aboveBucket: 'goals', goals,
      tasks: [task({ id: '1', title: 'Ship auth', bucket: 'quarter', goalId: 'g1' })],
    }))
    expect(lines).toHaveLength(1)
    expect(lines[0].tone).toBe('nudge')
    expect(lines[0].text).toContain('1 of 2')
    expect(lines[0].text).toContain('CrossFit consistency')
  })
  it('celebrates full coverage', () => {
    const lines = computeCoachLines(input({
      stepType: 'look-above', aboveBucket: 'goals', goals,
      tasks: [
        task({ id: '1', title: 'a', bucket: 'quarter', goalId: 'g1' }),
        task({ id: '2', title: 'b', bucket: 'quarter', goalId: 'g2' }),
      ],
    }))
    expect(lines).toHaveLength(1)
    expect(lines[0].tone).toBe('ok')
  })
  it('stays quiet on a fresh year (nothing linked yet)', () => {
    expect(computeCoachLines(input({ stepType: 'look-above', aboveBucket: 'goals', goals }))).toHaveLength(0)
  })
})

describe('write-list: fun audit', () => {
  it('nudges an all-obligation list', () => {
    const lines = computeCoachLines(input({
      stepType: 'write-list', bucket: 'month',
      tasks: ['a', 'b', 'c', 'd'].map((t, i) => task({ id: String(i), title: t, bucket: 'month' })),
    }))
    expect(lines).toHaveLength(1)
    expect(lines[0].id).toBe('fun-low')
  })
  it('acknowledges a balanced list', () => {
    const lines = computeCoachLines(input({
      stepType: 'write-list', bucket: 'month',
      tasks: [
        task({ id: '1', title: 'fun1', bucket: 'month', isFun: true }),
        task({ id: '2', title: 'fun2', bucket: 'month', isFun: true }),
        task({ id: '3', title: 'chore', bucket: 'month' }),
      ],
    }))
    expect(lines[0]?.id).toBe('fun-ok')
  })
  it('says nothing before the list has real size', () => {
    const lines = computeCoachLines(input({
      stepType: 'write-list', bucket: 'month',
      tasks: [task({ id: '1', title: 'only', bucket: 'month' })],
    }))
    expect(lines).toHaveLength(0)
  })
})

describe('projects: idle in-motion projects', () => {
  it('names in-progress projects absent from this list', () => {
    const lines = computeCoachLines(input({
      stepType: 'projects', bucket: 'month',
      projects: [project('p1', 'Compliance Router'), project('p2', 'Covered project')],
      tasks: [task({ id: '1', title: 'move', bucket: 'month', projectId: 'p2' })],
    }))
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toContain('Compliance Router')
    expect(lines[0].text).not.toContain('Covered project')
  })
  it('on-hold projects are not "in motion"', () => {
    const lines = computeCoachLines(input({
      stepType: 'projects', bucket: 'month',
      projects: [project('p1', 'Paused thing', 'on_hold')],
    }))
    expect(lines).toHaveLength(0)
  })
})

describe('funRatio', () => {
  it('holds an empty list as met', () => {
    expect(funRatio([])).toEqual({ fun: 0, obligation: 0, met: true })
  })
  it('requires 1 fun per 2 obligations', () => {
    const two = [task({ id: '1', title: 'a' }), task({ id: '2', title: 'b' })]
    expect(funRatio(two).met).toBe(false)
    expect(funRatio([...two, task({ id: '3', title: 'c', isFun: true })]).met).toBe(true)
  })
})
