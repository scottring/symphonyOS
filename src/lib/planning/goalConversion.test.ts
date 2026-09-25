import { describe, it, expect } from 'vitest'
import { goalConversion } from './goalConversion'
import type { Task } from '@/types/task'

const t = (over: Partial<Task> = {}) => ({ isGoal: false, completed: false, bucket: 'quarter', ...over } as Task)

describe('goalConversion — can this same row become a goal?', () => {
  it('a season or month task can', () => {
    expect(goalConversion(t({ bucket: 'quarter' }))).toEqual({ ok: true })
    expect(goalConversion(t({ bucket: 'month' }))).toEqual({ ok: true })
  })
  it('says why when it cannot — never a silent no', () => {
    const no = (x: ReturnType<typeof goalConversion>) => (x.ok ? '' : x.reason)
    expect(no(goalConversion(t({ bucket: 'week' })))).toMatch(/Only something on a month or season list/)
    expect(no(goalConversion(t({ bucket: 'timed' })))).toMatch(/not planned for a week or a day/)
    expect(no(goalConversion(t({ completed: true })))).toMatch(/Reopen it first/)
    expect(no(goalConversion(t({ goalTaskId: 'g1' }), [{ id: 'g1', title: 'Read more' } as Task]))).toMatch(/a step of “Read more”/)
    expect(no(goalConversion(t({ parentTaskId: 'p1' })))).toMatch(/part of another task/)
    expect(no(goalConversion(t({ isGoal: true })))).toMatch(/already a goal/)
  })
})
