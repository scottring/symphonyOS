import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { windowCalendar, buildPagePrompt, parsePageResponse, type PageAltitude } from '../../../supabase/functions/parse-page/lib/parse'
import { validatePageResult } from '@/lib/pageParse'
import { PageReviewSheet } from './PageReviewSheet'
import type { FamilyMember } from '@/types/family'

// The DETERMINISTIC half of "what does an imported line start as": given the
// model's answer, the real parse-page validation (parsePageResponse, as
// deployed in v10) and the client's (validatePageResult) carry it to the
// sheet's one "What is this?" choice unchanged. Which answer the model gives
// for a handwritten line is NOT tested here — that is model-dependent, and
// only its instructions (buildPagePrompt) are asserted below.

const MEMBERS = [{ id: 'm-1', name: 'Scott' }] as FamilyMember[]

function sheetFor(altitude: PageAltitude, modelItems: unknown[]) {
  const calendar = altitude === 'year' ? [] : windowCalendar('2026-10-01', '2026-10-31')
  const parsed = parsePageResponse(JSON.stringify({ items: modelItems, notes: [], unclear: [], page_title: null }),
    new Set(calendar.map((c) => c.ymd)), new Set(['m-1']), altitude)
  const body = { ok: true, ...parsed, window: calendar.map((c) => c.ymd), altitude }
  const result = validatePageResult(body, [{ id: 'm-1', name: 'Scott', role: null }], [], altitude)
  render(<PageReviewSheet items={result.items} notes={[]} unclear={[]} windowDates={result.windowDates} altitude={altitude}
    today={new Date(2026, 8, 27)} members={MEMBERS} currentMemberId="m-1" committing={false} onCommit={vi.fn()} onClose={vi.fn()} />)
}
const what = (title: string) => screen.getByRole('combobox', { name: `What is "${title}"?` })

// A representative month page: two multi-step projects, a single action, an
// appointment with a date, a repeating line — as the model is told to answer.
const MONTH_ANSWER = [
  { title: 'Plan Mia’s birthday party', day: 'goal', kind: 'task' },
  { title: 'Finish the patio', day: 'goal', kind: 'task' },
  { title: 'Renew the passports', day: 'month', kind: 'task' },
  { title: 'Dentist appointment', day: '2026-10-14', time: '15:00', kind: 'task' },
  { title: 'Soccer practice', day: 'month', kind: 'recurring', recurring: { days: ['tue', 'thu'], until: null } },
]

// 2026-10-08 (planning model: no goal/task split above the week): what the
// reader calls a "goal" on a month or season page starts as a plain line on
// that list; dated appointments and repeating lines keep their own kind.
const where = (title: string) => screen.getByRole('combobox', { name: `Where "${title}" goes` })
const kind = (title: string) => screen.getByRole('combobox', { name: `Kind of "${title}" (optional)` })

describe('import defaults through the real validation path', () => {
  it.each(['month', 'season'] as const)('a %s page: every undated line starts as a plain item on the page’s list; dated appointments and repeating lines keep their kind', (altitude) => {
    sheetFor(altitude, MONTH_ANSWER)
    expect(screen.queryByRole('combobox', { name: /What is/ })).toBeNull()
    for (const title of ['Plan Mia’s birthday party', 'Finish the patio', 'Renew the passports']) {
      expect(kind(title)).toHaveValue('task')
    }
    expect(where('Plan Mia’s birthday party')).toHaveValue(altitude)
    expect(where('Finish the patio')).toHaveValue(altitude)
    expect(kind('Dentist appointment')).toHaveValue('appointment')
    expect(kind('Soccer practice')).toHaveValue('routine')
  })

  it('a year page: lines start on the year’s list; a line the model placed on the season stays there', () => {
    sheetFor('year', [{ title: 'Run a half marathon', day: 'goal', kind: 'task' }, { title: 'Book Iceland flights', day: 'season', kind: 'task' }])
    expect(where('Run a half marathon')).toHaveValue('goal')
    expect(kind('Run a half marathon')).toHaveValue('task')
    expect(where('Book Iceland flights')).toHaveValue('season')
  })

  it('a week page (and Today) defaults to actions — even a line the model called a goal', () => {
    sheetFor('week', [{ title: 'Finish the patio', day: 'goal', kind: 'task' }, { title: 'Call the roofer', day: 'week', kind: 'task' }])
    expect(what('Finish the patio')).toHaveValue('task')
    expect(what('Call the roofer')).toHaveValue('task')
  })

  it('a repeating line the model also called a goal is a plain list line, nothing to answer before saving', () => {
    sheetFor('month', [{ title: 'Read more', day: 'goal', kind: 'recurring', recurring: { days: ['mon'], until: null } }])
    expect(kind('Read more')).toHaveValue('task')
    expect(where('Read more')).toHaveValue('month')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a repeating line with no days read starts as a plain list line, so the save is never blocked on a question', () => {
    sheetFor('month', [{ title: 'Soccer every week', day: 'month', kind: 'recurring', recurring: null }])
    expect(kind('Soccer every week')).toHaveValue('task')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /add 1 item/i })).toBeEnabled()
  })

  // The beta page (2026-10-08) lost a leading "Walkthrough" from its titles.
  it('keeps a title exactly as the reader returned it, leading label and all, through to the save', async () => {
    const onCommit = vi.fn()
    const calendar = windowCalendar('2026-10-01', '2026-10-31')
    const parsed = parsePageResponse(JSON.stringify({ items: [{ title: 'Walkthrough: Bring a picnic blanket', day: 'month', kind: 'task' }], notes: [], unclear: [], page_title: null }),
      new Set(calendar.map((c) => c.ymd)), new Set(['m-1']), 'month')
    const result = validatePageResult({ ok: true, ...parsed, window: calendar.map((c) => c.ymd), altitude: 'month' }, [{ id: 'm-1', name: 'Scott', role: null }], [], 'month')
    render(<PageReviewSheet items={result.items} notes={[]} unclear={[]} windowDates={result.windowDates} altitude="month"
      today={new Date(2026, 8, 27)} members={MEMBERS} currentMemberId="m-1" committing={false} onCommit={onCommit} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('Walkthrough: Bring a picnic blanket')).toBeInTheDocument()
    screen.getByRole('button', { name: /add 1 item/i }).click()
    expect(onCommit.mock.calls[0][0].items[0].title).toBe('Walkthrough: Bring a picnic blanket')
  })
})

describe('what the model is told', () => {
  it.each(['week', 'month', 'season', 'year'] as const)('the %s prompt asks for each title in the user’s own words, leading label kept', (altitude) => {
    const prompt = buildPagePrompt(altitude === 'year' ? [] : windowCalendar('2026-10-01', '2026-10-31'), [], '2026-09-27', altitude)
    expect(prompt).toMatch(/Keep each item's title in the user's own words/)
    expect(prompt).toContain('"Walkthrough: bring a picnic blanket" stays "Walkthrough: bring a picnic blanket"')
    expect(prompt).not.toMatch(/Short imperative task title/)
  })

  it.each(['month', 'season'] as const)('the %s prompt asks for outcomes/projects as goals and forbids goal-by-page', (altitude) => {
    const prompt = buildPagePrompt(windowCalendar('2026-10-01', '2026-10-31'), [], '2026-09-27', altitude)
    expect(prompt).toMatch(/"goal" for an OUTCOME or PROJECT/)
    expect(prompt).toMatch(/whether or not the page labels it a goal/)
    expect(prompt).toMatch(/Never make a line a goal just because it is on a (month|season) page: a single action stays an action/)
  })
})
