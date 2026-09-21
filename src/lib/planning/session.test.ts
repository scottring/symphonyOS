import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import { emptyDraft, lookBackRows, verdictOptions, summarize, isEmptyDraft } from './session'

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
    const r = lookBackRows(tasks, sep)
    expect(r.finished.map((x) => x.id)).toEqual(['a'])
    expect(r.open.map((x) => x.id)).toEqual(['b'])
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
    const d = { ...emptyDraft(oct, sep),
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

describe('isEmptyDraft', () => {
  it('is true for a fresh draft and false once anything is decided or written', () => {
    const d = emptyDraft(oct, sep)
    expect(isEmptyDraft(d)).toBe(true)
    expect(isEmptyDraft({ ...d, wentWell: 'x' })).toBe(false)
    expect(isEmptyDraft({ ...d, verdicts: { a: 'keep' } })).toBe(false)
  })
})
