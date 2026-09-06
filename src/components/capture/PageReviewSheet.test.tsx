import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PageReviewSheet } from './PageReviewSheet'
import type { PlanItem } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

const WINDOW = ['2026-08-17', '2026-08-18', '2026-08-19']
const MEMBERS = [{ id: 'm-iris', name: 'Iris' } as FamilyMember]
const ITEMS: PlanItem[] = [
  { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, time: null, assigneeId: null, note: '410-555-0100', dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
  { title: 'Return library books', placement: { kind: 'week' }, time: null, assigneeId: 'm-iris', note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
]
const NOTES: PageNote[] = [{ title: 'Roof quotes', content: 'Two quotes in, gutters add 1200' }]

function renderSheet(overrides: Partial<Parameters<typeof PageReviewSheet>[0]> = {}) {
  const onCommit = vi.fn()
  const onClose = vi.fn()
  render(
    <PageReviewSheet
      items={ITEMS}
      notes={NOTES}
      unclear={[]}
      windowDates={WINDOW}
      members={MEMBERS}
      committing={false}
      onCommit={onCommit}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onCommit, onClose }
}

describe('PageReviewSheet', () => {
  it('renders every parsed item with its note', () => {
    renderSheet()
    expect(screen.getByDisplayValue('Call dentist')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Return library books')).toBeInTheDocument()
    expect(screen.getByText('410-555-0100')).toBeInTheDocument()
  })

  it('renders parsed notes alongside the tasks', () => {
    renderSheet()
    expect(screen.getByDisplayValue('Roof quotes')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Two quotes in, gutters add 1200')).toBeInTheDocument()
  })

  it('commits included items and notes together', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(onCommit).toHaveBeenCalledWith({
      domain: 'family',
      items: [
        expect.objectContaining({ title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' } }),
        expect.objectContaining({ title: 'Return library books', placement: { kind: 'week' } }),
      ],
      notes: [{ title: 'Roof quotes', content: 'Two quotes in, gutters add 1200' }],
    })
  })

  it('excludes an unchecked note and updates the button count', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('checkbox', { name: /include note "Roof quotes"/i }))
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit).toHaveBeenCalledWith({ domain: 'family', items: expect.any(Array), notes: [] })
  })

  it('excludes an unchecked task row', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('checkbox', { name: /include "Call dentist"/i }))
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ title: 'Return library books' }),
    ])
  })

  it('commits an edited placement', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.selectOptions(screen.getAllByRole('combobox', { name: /when/i })[0], 'inbox')
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(onCommit.mock.calls[0][0].items[0].placement).toEqual({ kind: 'inbox' })
  })

  it('promotes an unclear line to a task', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({ items: [], notes: [], unclear: ['call ??? re fence'] })
    await user.click(screen.getByRole('button', { name: /make "call \?\?\? re fence" a task/i }))
    expect(screen.getByDisplayValue('call ??? re fence')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ title: 'call ??? re fence', placement: { kind: 'inbox' } }),
    ])
  })

  it('promotes an unclear line to a note', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({ items: [], notes: [], unclear: ['fence guy 410'] })
    await user.click(screen.getByRole('button', { name: /keep "fence guy 410" as a note/i }))
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].notes).toEqual([{ title: 'fence guy 410', content: 'fence guy 410' }])
  })

  it('shows the unreadable-page empty state with no commit button', () => {
    renderSheet({ items: [], notes: [], unclear: [] })
    expect(screen.getByText(/couldn.t read anything/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })
})

// Altitudes (2026-09-05): every page may place on the month, the season, or
// Someday; only a year page may write goals.
describe('PageReviewSheet — altitudes', () => {
  it('offers the horizon placements on a week page but never a goal', () => {
    renderSheet()
    const when = screen.getAllByRole('combobox', { name: /when/i })[0]
    const labels = Array.from(when.querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Inbox', 'This week', 'This month', 'This season', 'Someday']))
    expect(labels).not.toContain('Year goal')
  })

  it('commits a month placement chosen in the sheet', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.selectOptions(screen.getAllByRole('combobox', { name: /when/i })[0], 'month')
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(onCommit.mock.calls[0][0].items[0].placement).toEqual({ kind: 'month' })
  })

  it('on a year page, lines read as goals show a Goal badge, count as goals, and can still be demoted', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      altitude: 'year',
      windowDates: [],
      notes: [],
      items: [
        { title: 'Half marathon', placement: { kind: 'goal' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
        { title: 'Book Iceland flights', placement: { kind: 'season' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
      ],
    })
    expect(screen.getByText('Goal')).toBeInTheDocument()
    expect(screen.getByText(/read as a year page/i)).toBeInTheDocument()
    expect(screen.getByText(/1 task \/ 1 goal/)).toBeInTheDocument()
    const whens = screen.getAllByRole('combobox', { name: /when/i })
    expect(Array.from(whens[1].querySelectorAll('option')).map((o) => o.textContent)).toContain('Year goal')
    // A goal has no assignee: one Assignee select for the season task, none for the goal.
    expect(screen.getAllByRole('combobox', { name: /assignee/i })).toHaveLength(1)
    await user.selectOptions(whens[0], 'someday')
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit.mock.calls[0][0].items.map((i: { placement: unknown }) => i.placement)).toEqual([{ kind: 'someday' }, { kind: 'season' }])
  })

  // Step 5: a month page says which month it is for, one tap to fix; a goal
  // line is a goal on that list and can be toggled before commit.
  describe('month and season pages', () => {
    it('shows the month the page is for and commits the chosen month', async () => {
      const user = userEvent.setup()
      const { onCommit } = renderSheet({
        altitude: 'month', today: new Date(2026, 8, 5),
        items: [{ title: 'Repaint the porch', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null }],
        notes: [],
      })
      expect(screen.getByText('September')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Next month' }))
      expect(screen.getByText('October')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /add 1 item/i }))
      expect(onCommit.mock.calls[0][0].monthStart).toEqual(new Date(2026, 9, 1))
    })

    it('a page snapped in the last week of a month is for the coming month', () => {
      renderSheet({ altitude: 'month', today: new Date(2026, 8, 26), items: [], notes: [] })
      expect(screen.getByText('October')).toBeInTheDocument()
    })

    it('shows the season the page is for, from the household boundaries', async () => {
      const user = userEvent.setup()
      const { onCommit } = renderSheet({
        altitude: 'season', today: new Date(2026, 8, 20), seasons: DEFAULT_SEASONS,
        items: [{ title: 'Fall trips', placement: { kind: 'season' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null }],
        notes: [],
      })
      expect(screen.getByText('Fall 2026')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Previous season' }))
      expect(screen.getByText('Summer 2026')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /add 1 item/i }))
      expect(onCommit.mock.calls[0][0].seasonStart).toEqual(new Date(2026, 6, 1))
    })

    it('a goal line is badged, toggleable, and commits as a goal on the month', async () => {
      const user = userEvent.setup()
      const { onCommit } = renderSheet({
        altitude: 'month', today: new Date(2026, 8, 5),
        items: [
          { title: 'Read more', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, goal: true, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
          { title: 'Repaint the porch', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
        ],
        notes: [],
      })
      expect(screen.getByText(/1 task \/ 1 goal/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Make "Read more" a goal' })).toHaveAttribute('aria-pressed', 'true')
      await user.click(screen.getByRole('button', { name: 'Make "Repaint the porch" a goal' }))
      expect(screen.getByText(/2 goals/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /add 2 items/i }))
      expect(onCommit.mock.calls[0][0].items.map((i: { goal?: boolean }) => !!i.goal)).toEqual([true, true])
    })

    it('a goal moved onto a date stops being a goal — goals are never scheduled', async () => {
      const user = userEvent.setup()
      const { onCommit } = renderSheet({
        altitude: 'month', today: new Date(2026, 8, 5),
        items: [{ title: 'Read more', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, goal: true, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null }],
        notes: [],
      })
      await user.selectOptions(screen.getByRole('combobox', { name: /when/i }), '2026-09-18')
      expect(screen.queryByRole('button', { name: 'Make "Read more" a goal' })).toBeNull()
      await user.click(screen.getByRole('button', { name: /add 1 item/i }))
      expect(onCommit.mock.calls[0][0].items[0].goal).toBeFalsy()
    })

    it('a week page offers no goal toggle and no period chip', () => {
      renderSheet({ altitude: 'week' })
      expect(screen.queryByRole('button', { name: /a goal$/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /Next month|Next season/ })).toBeNull()
    })
  })
})

// Task 6 (2026-09-06): the sheet asks the domain once, opens on the period the
// page's own title names, re-windows when that chip flips, labels the goal
// control, and keeps day-facts already on the calendar / likely duplicates out
// of the way.
describe('PageReviewSheet — domain, page title, duplicates', () => {
  // Fall starts Sep 1 and Winter Dec 1 here, so the tests never lean on the
  // household default (which puts Fall in October).
  const SEASONS = [
    { name: 'Winter', month: 12, day: 1 },
    { name: 'Spring', month: 3, day: 1 },
    { name: 'Summer', month: 6, day: 1 },
    { name: 'Fall', month: 9, day: 1 },
  ] as unknown as typeof DEFAULT_SEASONS

  const base = {
    time: null, assigneeId: null, note: null, dateHint: null,
    kind: 'task' as const, recurring: null, phone: null, contactMemberId: null,
  }

  // The choice is remembered per altitude, so it must not leak between tests.
  beforeEach(() => { try { localStorage.clear() } catch { /* private mode */ } })

  it('shows the domain row defaulting to Family and reports it on commit', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    expect(screen.getByRole('radio', { name: 'Family' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Work' }))
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ domain: 'work' }))
  })

  it('reopens on the domain this altitude was last committed as', () => {
    localStorage.setItem('symphony.paper.domain.week', 'personal')
    renderSheet()
    expect(screen.getByRole('radio', { name: 'Personal' })).toBeChecked()
  })

  it('opens the season chip on the page title and says so', () => {
    renderSheet({
      altitude: 'season', today: new Date(2026, 8, 6), seasons: SEASONS, notes: [],
      titlePeriod: { kind: 'season', start: new Date(2026, 8, 1), label: 'Fall 2026' },
      pageTitle: 'Fall 2026',
      items: [{ ...base, title: 'Rake the yard', placement: { kind: 'season' } }],
    })
    expect(screen.getAllByText('Fall 2026').length).toBeGreaterThan(0)
    expect(screen.getByText(/Your page says/)).toBeInTheDocument()
  })

  it('flipping the chip re-windows: a Dec 12 hint becomes a date on the Winter list', async () => {
    const user = userEvent.setup()
    renderSheet({
      altitude: 'season', today: new Date(2026, 8, 6), seasons: SEASONS, notes: [],
      windowDates: ['2026-09-06'],
      items: [{ ...base, title: 'Recital', placement: { kind: 'season' }, dateHint: '2026-12-12' }],
    })
    // Fall runs Sep 1 – Nov 30 here, so Dec 12 is out of the window.
    expect(screen.getByRole('combobox', { name: 'When' })).toHaveValue('season')
    await user.click(screen.getByRole('button', { name: 'Next season' }))
    expect(screen.getByRole('combobox', { name: 'When' })).toHaveValue('2026-12-12')
    await user.click(screen.getByRole('button', { name: 'Previous season' }))
    expect(screen.getByRole('combobox', { name: 'When' })).toHaveValue('season')
  })

  it('a day-fact already on the calendar is listed apart and not committed', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      items: [{ ...base, title: 'No school — Labor Day', kind: 'dayfact', placement: { kind: 'date', date: '2026-09-07' }, dateHint: '2026-09-07' }],
      calendarTitlesByDay: new Map([['2026-09-07', ['Labor Day']]]),
    })
    expect(screen.getByText('Already on your calendar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit.mock.calls[0][0].items).toHaveLength(0)
  })

  it('a day-fact with no calendar match stays a row to add', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      notes: [],
      items: [{ ...base, title: 'Early dismissal', kind: 'dayfact', placement: { kind: 'date', date: '2026-08-18' }, dateHint: '2026-08-18' }],
      calendarTitlesByDay: new Map([['2026-08-18', ['Soccer practice']]]),
    })
    expect(screen.queryByText('Already on your calendar')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit.mock.calls[0][0].items).toHaveLength(1)
  })

  it('a likely duplicate offers Link and sets sourceId', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      notes: [],
      items: [{ ...base, title: 'Pumpkin patch', placement: { kind: 'date', date: '2026-08-18' } }],
      existingTasks: [{ id: 'x1', title: 'Go to pumpkin patch' }],
    })
    expect(screen.getByText(/Looks like/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Link/ }))
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit.mock.calls[0][0].items[0].sourceId).toBe('x1')
  })

  it('Keep separate drops the duplicate line and commits without a sourceId', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      notes: [],
      items: [{ ...base, title: 'Pumpkin patch', placement: { kind: 'date', date: '2026-08-18' } }],
      existingTasks: [{ id: 'x1', title: 'Go to pumpkin patch' }],
    })
    await user.click(screen.getByRole('button', { name: /^Keep separate/ }))
    expect(screen.queryByText(/Looks like/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit.mock.calls[0][0].items[0].sourceId).toBeUndefined()
  })

  it('the Goal control is a labelled button to the right of When, not a badge', () => {
    renderSheet({
      altitude: 'month', today: new Date(2026, 8, 5), notes: [],
      items: [{ ...base, title: 'Read a book', placement: { kind: 'month' } }],
    })
    expect(screen.getByRole('button', { name: 'Make "Read a book" a goal' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Task')).toBeInTheDocument() // the kind badge stays
  })

  it('a recurring line reads as a routine with its days, not a When select', () => {
    renderSheet({
      notes: [],
      items: [{ ...base, title: 'Trash out', kind: 'recurring', placement: { kind: 'week' }, recurring: { days: ['sat', 'sun'], until: null } }],
    })
    expect(screen.getByText('Routine · Sat, Sun')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'When' })).toBeNull()
  })
})
