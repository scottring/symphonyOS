import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { emptyDraft, lookBackRows, verdictOptions, summarize, isEmptyDraft, pruneDraft, goalsWithHiddenSteps } from './session'

const sep = new Date(2026, 8, 1), oct = new Date(2026, 9, 1)
const t = (over: Partial<Task>): Task => ({ id: 'x', title: 'X', completed: false, createdAt: sep, updatedAt: sep, bucket: 'month', ...over } as Task)

describe('lookBackRows', () => {
  it('splits the previous month into finished and still-open, skipping carried and removed', () => {
    const tasks = [
      t({ id: 'a', title: 'Done one', completed: true, commitments: [{ level: 'month', periodStart: sep, status: 'done' }] }),
      t({ id: 'b', title: 'Open one', commitments: [{ level: 'month', periodStart: sep, status: 'open' }] }),
      t({ id: 'c', title: 'Carried', commitments: [{ level: 'month', periodStart: sep, status: 'carried', carriedTo: oct }] }),
      t({ id: 'd', title: 'Removed', commitments: [{ level: 'month', periodStart: sep, status: 'removed' }] }),
      t({ id: 'e', title: 'Other month', commitments: [{ level: 'month', periodStart: oct, status: 'open' }] }),
    ]
    const r = lookBackRows(tasks, sep, null)
    expect(r.finished.map((x) => x.id)).toEqual(['a'])
    expect(r.open.map((x) => x.id)).toEqual(['b'])
  })

  // September's page hides a row assigned only to the partner (selectPeriodTasks'
  // doableBy); the look-back must not ask about it either (final review I5).
  it('leaves out rows assigned only to someone else, as the month page does', () => {
    const on = [{ level: 'month' as const, periodStart: sep, status: 'open' as const }]
    const tasks = [
      t({ id: 'mine', commitments: on, assignedTo: 'me' }),
      t({ id: 'nobody', commitments: on }),
      t({ id: 'partner', commitments: on, assignedTo: 'partner' }),
      t({ id: 'both', commitments: on, assignedToAll: ['partner', 'me'] }),
    ]
    expect(lookBackRows(tasks, sep, 'me').open.map((x) => x.id)).toEqual(['mine', 'nobody', 'both'])
    expect(lookBackRows(tasks, sep, null).open.map((x) => x.id)).toEqual(['mine', 'nobody', 'partner', 'both'])
  })
})

describe('verdictOptions', () => {
  it('offers "Keep, and add a next action" to goals only', () => {
    expect(verdictOptions(true).map((o) => o.verdict)).toEqual(['keep', 'keep-action', 'someday', 'drop'])
    expect(verdictOptions(false).map((o) => o.verdict)).toEqual(['keep', 'done', 'someday', 'drop'])
  })
})

describe('summarize', () => {
  it('says where every item lands, and leaves undecided rows open', () => {
    const goal = t({ id: 'g', title: 'Strength 2x/week', isGoal: true })
    const lib = t({ id: 'l', title: 'Library card' })
    const photos = t({ id: 'p', title: 'Photos' })
    const saw = t({ id: 's', title: 'Tile saw' })
    const bids = t({ id: 'b', title: 'Get three bids', bucket: 'quarter' })
    const d = { ...emptyDraft('month', oct, sep),
      verdicts: { g: 'keep-action' as const, l: 'keep' as const, p: 'drop' as const },
      actionTitles: { g: 'Book a PT evaluation' },
      newGoals: [{ id: 'n1', title: 'Three bids in hand', linkId: 'sg' }],
      newTasks: [{ id: 'n2', title: 'Call Hughes', linkId: 'n1' }],
      takenFromAbove: ['b'] }
    const sg = t({ id: 'sg', title: 'Sign a contractor', isGoal: true, bucket: 'quarter' })
    const lines = summarize(d, { open: [goal, lib, photos, saw], above: [bids], aboveGoals: [sg], periodLabel: 'October', prevLabel: 'September' })
    expect(lines).toEqual([
      { title: 'Strength 2x/week', destination: 'October goals · kept from September' },
      { title: 'Book a PT evaluation', destination: 'October tasks · new next action toward Strength 2x/week' },
      { title: 'Library card', destination: 'October tasks · kept from September' },
      { title: 'Photos', destination: "Dropped from September · the task is kept" },
      { title: 'Tile saw', destination: 'Left open in September' },
      { title: 'Three bids in hand', destination: 'October goals · for Sign a contractor' },
      { title: 'Call Hughes', destination: 'October tasks · toward Three bids in hand' },
      { title: 'Get three bids', destination: 'October tasks · stays on the season, marked "in October"' },
    ])
  })
})

// A goal's Keep carries its steps still open in September (keepForward). The
// summary must say so, and a step's own verdict is written BEFORE the goal
// carries, so it holds (final review I1).
describe('summarize — steps under a kept goal', () => {
  const on = [{ level: 'month' as const, periodStart: sep, status: 'open' as const }]
  const goal = t({ id: 'g', title: 'Porch', isGoal: true, commitments: on })
  const chairs = t({ id: 's1', title: 'Buy chairs', goalTaskId: 'g', commitments: on })
  const paint = t({ id: 's2', title: 'Paint', goalTaskId: 'g', commitments: on })
  const ctx = { open: [goal, chairs, paint], above: [], aboveGoals: [], periodLabel: 'October', prevLabel: 'September' }

  it('a step with no verdict of its own is carried with its goal', () => {
    for (const v of ['keep', 'keep-action'] as const) {
      const d = { ...emptyDraft('month', oct, sep), verdicts: { g: v }, actionTitles: { g: 'Sand' } }
      expect(summarize(d, ctx).find((l) => l.title === 'Buy chairs')).toEqual({ title: 'Buy chairs', destination: 'October tasks · carried with Porch' })
    }
  })

  it('a step with its own Drop stays dropped, whatever order the verdicts were clicked in', () => {
    for (const verdicts of [{ g: 'keep' as const, s1: 'drop' as const }, { s1: 'drop' as const, g: 'keep' as const }]) {
      const lines = summarize({ ...emptyDraft('month', oct, sep), verdicts }, ctx)
      expect(lines.find((l) => l.title === 'Buy chairs')!.destination).toBe('Dropped from September · the task is kept')
      expect(lines.find((l) => l.title === 'Paint')!.destination).toBe('October tasks · carried with Porch')
    }
  })

  it('a step under a goal that is NOT kept is left open', () => {
    const lines = summarize({ ...emptyDraft('month', oct, sep), verdicts: { g: 'drop' } }, ctx)
    expect(lines.find((l) => l.title === 'Buy chairs')!.destination).toBe('Left open in September')
  })
})

// The draft outlives the rows it names (localStorage). Only what the session
// SHOWS may be written: one pruned draft feeds both summary and Save (I2).
describe('pruneDraft', () => {
  const a = t({ id: 'a', title: 'A' }), b = t({ id: 'b', title: 'B', bucket: 'quarter' })
  it('drops verdicts and season pulls for rows no longer shown, keeps everything else', () => {
    const d = { ...emptyDraft('month', oct, sep),
      verdicts: { a: 'keep' as const, gone: 'drop' as const, g2: 'keep-action' as const },
      actionTitles: { gone: 'x', g2: 'y' }, actionIds: { gone: 'X', g2: 'Y' }, keptAlready: ['gone'],
      takenFromAbove: ['b', 'hidden'], newGoals: [{ id: 'n', title: 'N', context: null }], wentWell: 'w' }
    const p = pruneDraft(d, { open: [a], above: [b] })
    expect(p.verdicts).toEqual({ a: 'keep' })
    expect(p.actionTitles).toEqual({})
    expect(p.actionIds).toEqual({})
    expect(p.keptAlready).toEqual([])
    expect(p.takenFromAbove).toEqual(['b'])
    expect(p.newGoals).toEqual(d.newGoals)
    expect(p.wentWell).toBe('w')
  })

  it('keeps a goal already carried by a half-finished save, so its next action is still written and shown', () => {
    // The goal landed in October (no longer open in September); its action did not.
    const g = t({ id: 'g', title: 'Strength', isGoal: true })
    const d = { ...emptyDraft('month', oct, sep), verdicts: { g: 'keep-action' as const }, actionTitles: { g: 'Book PT' }, actionIds: { g: 'A1' }, keptAlready: ['g'] }
    const p = pruneDraft(d, { open: [], above: [], current: [g] })
    expect(p).toEqual(d)
    expect(summarize(p, { open: [], above: [], aboveGoals: [], current: [g], periodLabel: 'October', prevLabel: 'September' })).toEqual([
      { title: 'Strength', destination: 'October goals · kept from September' },
      { title: 'Book PT', destination: 'October tasks · new next action toward Strength' },
    ])
  })

  // Re-review N1: the goal's own carry landed but a step's failed, so keepForward
  // reported failure and keptAlready was never set. The goal is now on October
  // (current), not September (open). Its verdict must survive so Save again
  // retries the step, and a named next action must not vanish.
  it('keeps the verdict of a goal already carried whose Keep has not finished (keep and keep-action)', () => {
    const g = t({ id: 'g', title: 'Porch', isGoal: true })
    const step = t({ id: 's', title: 'Buy chairs', goalTaskId: 'g', commitments: [{ level: 'month', periodStart: sep, status: 'open' }] })
    for (const d of [
      { ...emptyDraft('month', oct, sep), verdicts: { g: 'keep' as const } },
      { ...emptyDraft('month', oct, sep), verdicts: { g: 'keep-action' as const }, actionTitles: { g: 'Sand' }, actionIds: { g: 'A1' } },
    ]) {
      const p = pruneDraft(d, { open: [step], above: [], current: [g] })
      expect(p).toBe(d)
      const lines = summarize(p, { open: [step], above: [], aboveGoals: [], current: [g], periodLabel: 'October', prevLabel: 'September' })
      expect(lines.find((l) => l.title === 'Buy chairs')!.destination).toBe('October tasks · carried with Porch')
    }
    const d = { ...emptyDraft('month', oct, sep), verdicts: { g: 'keep-action' as const }, actionTitles: { g: 'Sand' }, actionIds: { g: 'A1' } }
    expect(summarize(d, { open: [step], above: [], aboveGoals: [], current: [g], periodLabel: 'October', prevLabel: 'September' }))
      .toContainEqual({ title: 'Sand', destination: 'October tasks · new next action toward Porch' })
  })

  it('returns the same draft object when nothing is stale', () => {
    const d = { ...emptyDraft('month', oct, sep), verdicts: { a: 'keep' as const } }
    expect(pruneDraft(d, { open: [a], above: [] })).toBe(d)
  })
})

// keepForward carries ALL of a kept goal's open steps, including ones this view
// hides (domain filter, partner-only). The summary says so, without a count.
describe('steps a kept goal carries that the view does not show', () => {
  const on = [{ level: 'month' as const, periodStart: sep, status: 'open' as const }]
  const goal = t({ id: 'g', title: 'Porch', isGoal: true, commitments: on })
  const shown = t({ id: 's1', title: 'Buy chairs', goalTaskId: 'g', commitments: on })
  const hidden = t({ id: 's2', title: 'Partner step', goalTaskId: 'g', commitments: on, assignedTo: 'partner' })
  const doneHidden = t({ id: 's3', title: 'Done', goalTaskId: 'g', completed: true, commitments: [{ level: 'month', periodStart: sep, status: 'done' }] })

  it('finds goals with open source-month steps outside the shown list', () => {
    expect([...goalsWithHiddenSteps([goal, shown, hidden, doneHidden], [goal, shown], sep)]).toEqual(['g'])
    expect([...goalsWithHiddenSteps([goal, shown, doneHidden], [goal, shown], sep)]).toEqual([])
  })

  it('adds one line for a KEPT goal that carries hidden steps', () => {
    const ctx = { open: [goal, shown], above: [], aboveGoals: [], hiddenStepGoals: new Set(['g']), periodLabel: 'October', prevLabel: 'September' }
    expect(summarize({ ...emptyDraft('month', oct, sep), verdicts: { g: 'keep' } }, ctx))
      .toContainEqual({ title: 'Porch also carries steps not shown in this view', destination: 'October tasks · carried with Porch' })
    expect(summarize({ ...emptyDraft('month', oct, sep), verdicts: { g: 'drop' } }, ctx).some((l) => /not shown/.test(l.title))).toBe(false)
  })
})

describe('isEmptyDraft', () => {
  it('is true for a fresh draft and false once anything is decided or written', () => {
    const d = emptyDraft('month', oct, sep)
    expect(isEmptyDraft(d)).toBe(true)
    expect(isEmptyDraft({ ...d, wentWell: 'x' })).toBe(false)
    expect(isEmptyDraft({ ...d, verdicts: { a: 'keep' } })).toBe(false)
  })
})
