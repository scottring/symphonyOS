import { describe, it, expect } from 'vitest'
import { checklistRows, checklistSlots, checklistTokens } from './cadenceChecklist'

const SEASONS = [{ name: 'Spring', month: 3, day: 1 }, { name: 'Summer', month: 6, day: 1 }, { name: 'Fall', month: 9, day: 1 }, { name: 'Winter', month: 12, day: 1 }]
// Saturday Oct 17 2026, weeks starting Saturday.
const slots = checklistSlots(new Date(2026, 9, 17), 6, SEASONS as never)

describe('cadenceChecklist', () => {
  it('names last period to review and this one to plan, with week dates', () => {
    const rows = checklistRows(slots, [])
    expect(rows.week.review).toMatchObject({ label: expect.stringMatching(/^Review week \d+$/), done: false, dates: 'Oct 10 – 16', to: '/week?view=alongside&date=2026-10-17&start=2026-10-17&review=1' })
    expect(rows.week.plan).toMatchObject({ label: expect.stringMatching(/^Plan week \d+$/), dates: 'Oct 17 – 23', to: '/week?view=alongside&plan=1' })
    expect(rows.month.review).toMatchObject({ label: 'Review September', to: '/month?start=2026-09-01&review=1' })
    expect(rows.month.plan).toMatchObject({ label: 'Plan October', to: '/month?start=2026-10-01&plan=1' })
    expect(rows.month.due).toBe('plan')
    expect(rows.season.due).toBe('plan')
    expect(rows.year.due).toBeUndefined()
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

  // The deck on week W reviews W − 1: the link opens this week, and the week
  // it opens, less seven days, is the week whose review the checklist reads.
  it('the week review link opens the week whose last week is the one it reads', () => {
    const to = new URLSearchParams(slots.week.review.to.split('?')[1])
    expect(to.get('review')).toBe('1')
    const [y, m, d] = to.get('date')!.split('-').map(Number)
    const lastWeek = new Date(y, m - 1, d - 7)
    expect(`${lastWeek.getFullYear()}-${lastWeek.getMonth() + 1}-${lastWeek.getDate()}`).toBe(slots.week.review.token)
    expect(to.get('start')).toBe(to.get('date'))
  })

  // Scott, 2026-10-31: Home nudged the week but never the month. In a
  // period's last days its page's button is "Review October", walking on into
  // November, so Home's steps move with it.
  it('in a month’s last days: review this month, plan the next, the review due', () => {
    const rows = checklistRows(checklistSlots(new Date(2026, 9, 31), 6, SEASONS as never), [])
    expect(rows.month.review).toMatchObject({ label: 'Review October', to: '/month?start=2026-10-01&review=1' })
    expect(rows.month.plan).toMatchObject({ label: 'Plan November', to: '/month?start=2026-11-01&plan=1' })
    expect(rows.month.due).toBe('review')
    const reviewed = checklistRows(checklistSlots(new Date(2026, 9, 31), 6, SEASONS as never), [
      { horizon: 'monthly', period_token: '2026-10', notes: { periodReview: { at: 'x' } } },
    ])
    expect(reviewed.month.review.done).toBe(true)
  })

  it('a season’s last week and the year’s turn move the same way; the year’s plan is due only Jan 1–14', () => {
    const late = checklistRows(checklistSlots(new Date(2026, 10, 27), 6, SEASONS as never), [])
    expect(late.season).toMatchObject({ review: { label: 'Review Fall' }, plan: { label: 'Plan Winter', to: '/season?start=2026-12-01&plan=1' }, due: 'review' })
    const dec = checklistRows(checklistSlots(new Date(2026, 11, 28), 6, SEASONS as never), [])
    expect(dec.year).toMatchObject({ review: { label: 'Review 2026' }, plan: { label: 'Plan 2027', to: '/year?start=2027-01-01&plan=1' }, due: 'review' })
    const jan = checklistRows(checklistSlots(new Date(2027, 0, 5), 6, SEASONS as never), [])
    expect(jan.year).toMatchObject({ plan: { label: 'Plan 2027' }, due: 'plan' })
  })

  it('reads every period in one query', () => {
    expect(checklistTokens(slots).sort()).toEqual(['2025', '2026', '2026-10', '2026-10-10', '2026-10-17', '2026-9', '2026-fall', '2026-summer'])
  })
})
