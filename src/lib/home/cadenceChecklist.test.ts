import { describe, it, expect } from 'vitest'
import { checklistRows, checklistSlots, checklistTokens } from './cadenceChecklist'

const SEASONS = [{ name: 'Spring', month: 3, day: 1 }, { name: 'Summer', month: 6, day: 1 }, { name: 'Fall', month: 9, day: 1 }, { name: 'Winter', month: 12, day: 1 }]
// Saturday Oct 17 2026, weeks starting Saturday.
const slots = checklistSlots(new Date(2026, 9, 17), 6, SEASONS as never)

describe('cadenceChecklist', () => {
  it('names last period to review and this one to plan, with week dates', () => {
    const rows = checklistRows(slots, [])
    expect(rows.week.review).toMatchObject({ label: expect.stringMatching(/^Review week \d+$/), done: false, dates: 'Oct 10 – 16', to: '/week?view=alongside&date=2026-10-10&start=2026-10-10&review=1' })
    expect(rows.week.plan).toMatchObject({ label: expect.stringMatching(/^Plan week \d+$/), dates: 'Oct 17 – 23', to: '/week?view=alongside&plan=1' })
    expect(rows.month.review).toMatchObject({ label: 'Review September', to: '/month?start=2026-09-01&review=1' })
    expect(rows.month.plan).toMatchObject({ label: 'Plan October', to: '/month?plan=1' })
    expect(rows.season.review.label).toBe('Review Summer')
    expect(rows.season.plan.label).toBe('Plan Fall')
    expect(rows.year.review).toMatchObject({ label: 'Review 2025', to: '/year?start=2025-01-01&review=1' })
    expect(rows.year.plan.label).toBe('Plan 2026')
  })

  it('ticks a review from periodReview and a plan from savedAt, by anyone in the household', () => {
    const rows = checklistRows(slots, [
      { horizon: 'weekly', period_token: '2026-10-10', notes: { periodReview: { at: '2026-10-17T09:00:00Z' } } },
      { horizon: 'weekly', period_token: '2026-10-17', notes: { savedAt: '2026-10-17T10:00:00Z' } },
      { horizon: 'monthly', period_token: '2026-10', notes: { periodReview: { at: 'x' } } }, // October's own review, not September's
      { horizon: 'seasonal', period_token: '2026-fall', notes: { savedAt: '2026-09-02' } },
    ])
    expect(rows.week.review).toMatchObject({ done: true, label: expect.stringMatching(/^Reviewed week \d+$/) })
    expect(rows.week.plan).toMatchObject({ done: true, label: expect.stringMatching(/^Planned week \d+$/) })
    expect(rows.month.review.done).toBe(false)
    expect(rows.month.plan.done).toBe(false)
    expect(rows.season.plan).toMatchObject({ done: true, label: 'Planned Fall' })
  })

  it('reads every period in one query', () => {
    expect(checklistTokens(slots).sort()).toEqual(['2025', '2026', '2026-10', '2026-10-10', '2026-10-17', '2026-9', '2026-fall', '2026-summer'])
  })
})
