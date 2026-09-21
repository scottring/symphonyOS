import { describe, it, expect, vi } from 'vitest'
import { emptyDraft, type SessionDraft } from './session'
import { applySession, type SessionWriters } from './applySession'

const oct = new Date(2026, 9, 1), sep = new Date(2026, 8, 1)
/** A fake store with idempotent creates: creating an existing id returns it, adds nothing. */
const writers = (over: Partial<SessionWriters> = {}) => {
  const calls: string[] = []
  const rows = new Map<string, string>()
  const w: SessionWriters = {
    keep: vi.fn(async (id, _m, from) => { calls.push(`keep:${id}`); expect(from.getMonth()).toBe(8); return true }),   // always FROM September
    addTask: vi.fn(async (title, o) => { calls.push(`add:${title}:${o.isGoal ? 'goal' : 'task'}:${o.goalTaskId ?? '-'}`); if (!rows.has(o.id)) rows.set(o.id, title); return o.id }),
    contextOf: vi.fn(() => null),
    complete: vi.fn(async (id) => { calls.push(`done:${id}`); return true }),
    someday: vi.fn(async (id) => { calls.push(`someday:${id}`); return true }),
    drop: vi.fn(async (id) => { calls.push(`drop:${id}`); return true }),
    takeIntoMonth: vi.fn(async (id, m) => { calls.push(`take:${id}:${m.getMonth()}`); return true }),
    saveSession: vi.fn(async () => { calls.push('session'); return true }),
    ...over,
  }
  return { w, calls, rows }
}
const full = (): SessionDraft => ({ ...emptyDraft('month', oct, sep),
  verdicts: { g: 'keep-action', l: 'keep', p: 'drop', s: 'someday', x: 'done' },
  actionTitles: { g: 'Book a PT evaluation' }, actionIds: { g: 'A1' },
  newGoals: [{ id: 'G1', title: 'Three bids' }],
  newTasks: [{ id: 'T1', title: 'Call Hughes', linkId: 'G1' }, { id: 'T2', title: 'Loose' }],
  takenFromAbove: ['b'], wentWell: 'w', didnt: 'd' })

describe('applySession', () => {
  it('writes in dependency order, into the session month, then records the session', async () => {
    const { w, calls } = writers()
    const r = await applySession(full(), w, () => false)
    expect(r.ok).toBe(true)
    expect(calls).toEqual([
      // Endings first, so a goal's Keep never carries a step the session dropped (final review I1).
      'drop:p', 'someday:s', 'done:x', 'keep:g', 'add:Book a PT evaluation:task:g', 'keep:l',
      'add:Three bids:goal:-', 'add:Call Hughes:task:G1', 'add:Loose:task:-', 'take:b:9', 'session',
    ])
  })

  it('reports progress after every successful item', async () => {
    const { w } = writers()
    const seen: SessionDraft[] = []
    await applySession(full(), w, () => false, (d) => seen.push(d))
    expect(seen.length).toBeGreaterThanOrEqual(10)
    expect(seen.at(-1)!.newTasks).toEqual([])
    expect(seen.find((d) => d.created.includes('G1'))!.newGoals).toEqual([])
  })

  it('a false return is a failure: the item stays, the session is not recorded, the notes stay', async () => {
    const { w } = writers({ drop: vi.fn(async () => false) })
    const r = await applySession(full(), w, () => false)
    expect(r.ok).toBe(false)
    expect(w.saveSession).not.toHaveBeenCalled()
    expect(r.remaining.verdicts).toEqual({ p: 'drop' })
    expect(r.remaining.wentWell).toBe('w')
  })

  it('never creates a task under a goal that was not written', async () => {
    const base = writers()
    const { w, calls } = writers({ addTask: vi.fn(async (title, o) => (o.isGoal ? undefined : base.w.addTask(title, o))) })
    const r = await applySession(full(), w, () => false)
    expect(calls.some((c) => c.startsWith('add:Call Hughes'))).toBe(false)
    expect(base.calls.some((c) => c.startsWith('add:Call Hughes'))).toBe(false)
    expect(r.remaining.newGoals.map((g) => g.id)).toEqual(['G1'])
    expect(r.remaining.newTasks).toEqual([{ id: 'T1', title: 'Call Hughes', linkId: 'G1' }])
  })

  it('an interrupted save resumed from the last persisted progress creates nothing twice', async () => {
    const store = writers()
    let persisted: SessionDraft = full()
    // "Reload" right after the goal is created: the writer throws on the next create.
    let n = 0
    const interrupted = { ...store.w, addTask: vi.fn(async (title: string, o: Parameters<SessionWriters['addTask']>[1]) => {
      if (++n === 3) throw new Error('page reloaded')
      return store.w.addTask(title, o)
    }) }
    await applySession(persisted, interrupted, () => false, (d) => { persisted = d })
    // Worst case: progress for the last success was not persisted — replay from one step earlier too.
    await applySession(full(), store.w, () => false)
    await applySession(persisted, store.w, () => false)
    expect([...store.rows.keys()].sort()).toEqual(['A1', 'G1', 'T1', 'T2'])
  })

  it('a kept goal whose next action failed retries only the action', async () => {
    const first = writers({ addTask: vi.fn(async () => undefined) })
    const r1 = await applySession({ ...emptyDraft('month', oct, sep), verdicts: { g: 'keep-action' }, actionTitles: { g: 'Book PT' }, actionIds: { g: 'A1' } }, first.w, () => false)
    expect(r1.remaining.keptAlready).toEqual(['g'])
    const second = writers()
    await applySession(r1.remaining, second.w, () => false)
    expect(second.calls).toEqual(['add:Book PT:task:g', 'session'])
  })

  it('never re-completes a finished task (counts as done)', async () => {
    const { w } = writers()
    const r = await applySession({ ...emptyDraft('month', oct, sep), verdicts: { b: 'done' } }, w, () => true)
    expect(w.complete).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
  })

  it('ends a step before its goal carries, whichever verdict was clicked first', async () => {
    for (const verdicts of [{ g: 'keep', s1: 'drop' }, { s1: 'drop', g: 'keep' }] as const) {
      const { w, calls } = writers()
      await applySession({ ...emptyDraft('month', oct, sep), verdicts: { ...verdicts } }, w, () => false)
      expect(calls).toEqual(['drop:s1', 'keep:g', 'session'])
    }
    const { w, calls } = writers()
    await applySession({ ...emptyDraft('month', oct, sep), verdicts: { g: 'keep-action', s1: 'someday', s2: 'done' }, actionTitles: { g: 'A' }, actionIds: { g: 'A1' } }, w, () => false)
    expect(calls).toEqual(['someday:s1', 'done:s2', 'keep:g', 'add:A:task:g', 'session'])
  })

  it('creates each new item in the domain it was planned in; a next action takes its goal\'s', async () => {
    const { w } = writers({ contextOf: vi.fn((id: string) => (id === 'g' ? 'family' as const : null)) })
    await applySession({ ...emptyDraft('month', oct, sep),
      verdicts: { g: 'keep-action' }, actionTitles: { g: 'Book PT' }, actionIds: { g: 'A1' },
      newGoals: [{ id: 'G1', title: 'Three bids', context: 'work' }],
      newTasks: [{ id: 'T1', title: 'Call Hughes', linkId: 'G1', context: 'work' }, { id: 'T2', title: 'Loose', context: null }],
    }, w, () => false)
    const ctxOf = (title: string) => (w.addTask as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === title)![1].context
    expect(ctxOf('Book PT')).toBe('family')
    expect(ctxOf('Three bids')).toBe('work')
    expect(ctxOf('Call Hughes')).toBe('work')
    expect(ctxOf('Loose')).toBeNull()
  })
})
