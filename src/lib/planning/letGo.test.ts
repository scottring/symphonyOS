import { describe, it, expect, vi } from 'vitest'
import type { Task } from '@/types/task'
import { isLetGo, letGoNote, letGoUpdates, unletGoUpdates, bringBack, withoutLetGo, selectLetGoTasks } from './letGo'

// Let go means not ever (Scott, 2026-11-04).
const FALL = new Date(2026, 8, 1), NOV = new Date(2026, 10, 1)
const task = (over: Partial<Task> = {}): Task => ({ id: 't', title: 'Plan winter vacation', completed: false, createdAt: NOV, updatedAt: NOV, ...over }) as Task

describe('letGo', () => {
  it('lets go: to Someday, marked when', () => {
    const at = new Date(2026, 10, 4, 9)
    // The day goes with the lists, and so does the pick for a day (focus).
    expect(letGoUpdates(at)).toEqual({ bucket: 'someday', dismissedAt: at, focus: [] })
    expect(isLetGo(task({ dismissedAt: at }))).toBe(true)
    expect(isLetGo(task())).toBe(false)
  })

  it('Undo states the periods and the place it had, and clears the mark', () => {
    const picked = [{ userId: 'me', date: new Date(2026, 10, 4) }]
    const t = task({ bucket: 'month', monthStart: NOV, seasonStart: FALL, focus: picked, commitments: [
      { level: 'season', periodStart: FALL, status: 'open' }, { level: 'month', periodStart: NOV, status: 'open' },
    ] })
    expect(unletGoUpdates(t)).toMatchObject({
      bucket: 'month', monthStart: NOV, seasonStart: FALL, scheduledFor: null, dismissedAt: undefined, focus: picked,
      commitments: [{ level: 'season', periodStart: FALL, status: 'open' }, { level: 'month', periodStart: NOV, status: 'open' }],
    })
    expect('dismissedAt' in unletGoUpdates(t)).toBe(true)
  })

  it('search’s note: "Let go Nov 4"; nothing for a school paper or an item still on its lists', () => {
    expect(letGoNote(task({ dismissedAt: new Date(2026, 10, 4, 9) }))).toBe('Let go Nov 4')
    expect(letGoNote(task({ dismissedAt: new Date(2026, 10, 4, 9), category: 'paper' }))).toBeNull()
    expect(letGoNote(task())).toBeNull()
  })
})

describe('bringBack (the task panel’s "Let go Nov 4 · Bring back")', () => {
  it('writes unletGoUpdates, and Undo lets it go again on the same date', async () => {
    const at = new Date(2026, 10, 4, 9)
    const t = task({ bucket: 'someday', dismissedAt: at })
    const updateTask = vi.fn(async () => true)
    let undo: (() => Promise<boolean>) | undefined
    const run = vi.fn(async (_l: string, cmd: () => Promise<boolean>, o?: { undo?: () => Promise<boolean> }) => { undo = o?.undo; return cmd() })
    expect(await bringBack(t, updateTask, run)).toBe(true)
    expect(run.mock.calls[0][0]).toBe('Bring back “Plan winter vacation”')
    expect(updateTask).toHaveBeenLastCalledWith('t', unletGoUpdates(t))
    expect(updateTask.mock.calls[0][1]).toMatchObject({ dismissedAt: undefined, bucket: 'someday' })
    await undo!()
    expect(updateTask).toHaveBeenLastCalledWith('t', letGoUpdates(at))
  })
})

describe('the hook boundary’s selectors', () => {
  const gone = new Date(2026, 10, 4)
  const live = task({ id: 'live', subtasks: [task({ id: 's1' }), task({ id: 's2', dismissedAt: gone })] })
  const letGone = task({ id: 'g', dismissedAt: gone })
  it('withoutLetGo leaves out let-go items and let-go steps', () => {
    const out = withoutLetGo([live, letGone])
    expect(out.map((t) => t.id)).toEqual(['live'])
    expect(out[0].subtasks!.map((s) => s.id)).toEqual(['s1'])
    const plain = [task({ id: 'a' })]
    expect(withoutLetGo(plain)).toBe(plain)
  })
  it('selectLetGoTasks is what withoutLetGo leaves out', () => {
    expect(selectLetGoTasks([live, letGone]).map((t) => t.id)).toEqual(['g', 's2'])
  })
})
