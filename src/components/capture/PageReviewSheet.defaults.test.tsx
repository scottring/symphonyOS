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

describe('import defaults through the real validation path', () => {
  it.each(['month', 'season'] as const)('a %s page: projects start as goals; single actions, dated appointments and repeating lines keep their own type', (altitude) => {
    sheetFor(altitude, MONTH_ANSWER)
    expect(what('Plan Mia’s birthday party')).toHaveValue('goal')
    expect(what('Finish the patio')).toHaveValue('goal')
    expect(what('Renew the passports')).toHaveValue('task')
    expect(what('Dentist appointment')).toHaveValue('appointment')
    expect(what('Soccer practice')).toHaveValue('routine')
  })

  it('a year page: goals are year goals; a line the model placed on the season stays an action', () => {
    sheetFor('year', [{ title: 'Run a half marathon', day: 'goal', kind: 'task' }, { title: 'Book Iceland flights', day: 'season', kind: 'task' }])
    expect(what('Run a half marathon')).toHaveValue('goal')
    expect(screen.getByRole('combobox', { name: 'Goal for "Run a half marathon"' })).toHaveValue('goal')
    expect(what('Book Iceland flights')).toHaveValue('task')
  })

  it('a week page (and Today) defaults to actions — even a line the model called a goal', () => {
    sheetFor('week', [{ title: 'Finish the patio', day: 'goal', kind: 'task' }, { title: 'Call the roofer', day: 'week', kind: 'task' }])
    expect(what('Finish the patio')).toHaveValue('task')
    expect(what('Call the roofer')).toHaveValue('task')
  })

  it('a goal is never forced onto a repeating line: the recurring answer wins only when it is not a goal', () => {
    sheetFor('month', [{ title: 'Read more', day: 'goal', kind: 'recurring', recurring: { days: ['mon'], until: null } }])
    expect(what('Read more')).toHaveValue('goal')
  })
})

describe('what the model is told (v10 prompt, unchanged by this branch)', () => {
  it.each(['month', 'season'] as const)('the %s prompt asks for outcomes/projects as goals and forbids goal-by-page', (altitude) => {
    const prompt = buildPagePrompt(windowCalendar('2026-10-01', '2026-10-31'), [], '2026-09-27', altitude)
    expect(prompt).toMatch(/"goal" for an OUTCOME or PROJECT/)
    expect(prompt).toMatch(/whether or not the page labels it a goal/)
    expect(prompt).toMatch(/Never make a line a goal just because it is on a (month|season) page: a single action stays an action/)
  })
})
