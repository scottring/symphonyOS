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

  // At 390px the footer holds Cancel, the long "Add to the plan I'm
  // writing (…)" button, and the Add-N button — it must wrap instead of
  // clipping, and the long button must not force the footer wider than the sheet.
  it('the footer wraps instead of clipping at narrow widths', () => {
    renderSheet({ draftLabelFor: () => 'Week of Aug 17', onAddToDraft: vi.fn() })
    const draftButton = screen.getByRole('button', { name: /Add to the plan I.m writing/i })
    expect(draftButton.closest('div')).toHaveClass('flex-wrap')
    expect(draftButton).toHaveClass('max-w-full')
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

  // 2026-10-08: above the week there is no goal/task split — a year line
  // starts on the year's list (its goals rows), and where it goes is the
  // one choice; its kind is optional.
  it('on a year page, every line starts on the year’s list as a plain list item, and can be moved off it', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      altitude: 'year',
      today: new Date(2026, 9, 8),
      windowDates: [],
      notes: [],
      items: [
        { title: 'Half marathon', placement: { kind: 'goal' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
        { title: 'Book Iceland flights', placement: { kind: 'season' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
      ],
    })
    expect(screen.queryByRole('combobox', { name: /What is/ })).toBeNull()
    const where = screen.getByRole('combobox', { name: 'Where "Half marathon" goes' })
    expect(where).toHaveValue('goal')
    expect(where.querySelector('option[value="goal"]')).toHaveTextContent('2026’s list')
    expect(screen.getByRole('combobox', { name: 'Kind of "Half marathon" (optional)' })).toHaveValue('task')
    expect(screen.getByText(/Check these — Symphony read them from your photo/)).toBeInTheDocument()
    expect(screen.getByText(/Ready to add:/).parentElement).toHaveTextContent('1 on 2026’s list')
    // Year lines take people (#64): every row has its own Assignee select.
    expect(screen.getAllByRole('combobox', { name: /assignee/i })).toHaveLength(2)
    await user.selectOptions(where, 'someday')
    expect(screen.getByText('Kept for someday, off the lists for now.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit.mock.calls[0][0].items.map((i: { placement: unknown }) => i.placement)).toEqual([{ kind: 'someday' }, { kind: 'season' }])
  })

  // Step 5: a month page says which month it is for, one tap to fix. Since
  // 2026-10-08 a line on it is a plain list item (no goal/task split).
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
      expect(onCommit.mock.calls[0][0].seasonStart).toEqual(new Date(2026, 5, 1))
    })

    // Beta walkthrough 2026-10-08: "Bring a picnic blanket" came back
    // "Goal or project" beside two errands read as actions. Above the week a
    // line is a plain list item — whatever the reader called it.
    it('a line the reader called a goal starts as a plain list item on the month — no goal/task choice to make', async () => {
      const user = userEvent.setup()
      const { onCommit } = renderSheet({
        altitude: 'month', today: new Date(2026, 8, 5),
        items: [
          { title: 'Bring a picnic blanket', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, goal: true, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
          { title: 'Buy sunscreen', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null },
        ],
        notes: [],
      })
      expect(screen.queryByRole('combobox', { name: /What is/ })).toBeNull()
      expect(screen.queryByText(/goal or project/i)).toBeNull()
      expect(screen.getByText(/Ready to add:/).parentElement).toHaveTextContent('2 on September’s list')
      expect(screen.getByText(/Each line goes on/)).toHaveTextContent('Each line goes on September’s list — something to keep in view. To make one a step you can put on a day, change where it goes.')
      const kind = screen.getByRole('combobox', { name: 'Kind of "Bring a picnic blanket" (optional)' })
      expect(kind).toHaveValue('task')
      expect(Array.from(kind.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['List item', 'Appointment', 'Activity', 'Routine'])
      await user.click(screen.getByRole('button', { name: /add 2 items/i }))
      expect(onCommit.mock.calls[0][0].items.map((i: { goal?: boolean; placement: unknown }) => [!!i.goal, i.placement])).toEqual([[false, { kind: 'month' }], [false, { kind: 'month' }]])
    })

    it('a list line can become a step on a day, and the sheet says what that means', async () => {
      const user = userEvent.setup()
      const { onCommit } = renderSheet({
        altitude: 'month', today: new Date(2026, 8, 5),
        items: [{ title: 'Read more', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, goal: true, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null }],
        notes: [],
      })
      const where = screen.getByRole('combobox', { name: 'Where "Read more" goes' })
      expect(where).toHaveValue('month')
      // The default needs no words of its own: the sentence over the rows says it.
      expect(screen.queryByText(/^A step/)).toBeNull()
      await user.selectOptions(where, '2026-09-18')
      expect(screen.getByText('A step on Fri, Sep 18.')).toBeInTheDocument()
      await user.selectOptions(where, 'week')
      expect(screen.getByText(/A step for this week — you can put it on a day/)).toBeInTheDocument()
      await user.selectOptions(where, '2026-09-18')
      await user.click(screen.getByRole('button', { name: /add 1 item/i }))
      expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ goal: false, placement: { kind: 'date', date: '2026-09-18' } })
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
    expect(screen.getByRole('combobox', { name: 'Where "Recital" goes' })).toHaveValue('season')
    expect(screen.getByText('Fall 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next season' }))
    // The chip must NAME the season it re-windowed onto, not just window on it.
    expect(screen.getByText('Winter 2026')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Where "Recital" goes' })).toHaveValue('2026-12-12')
    await user.click(screen.getByRole('button', { name: 'Previous season' }))
    expect(screen.getByText('Fall 2026')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Where "Recital" goes' })).toHaveValue('season')
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
    await user.click(screen.getByRole('button', { name: 'Use existing item' }))
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit.mock.calls[0][0].items[0].sourceId).toBe('x1')
  })

  it('Add as new drops the duplicate line and commits without a sourceId', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      notes: [],
      items: [{ ...base, title: 'Pumpkin patch', placement: { kind: 'date', date: '2026-08-18' } }],
      existingTasks: [{ id: 'x1', title: 'Go to pumpkin patch' }],
    })
    await user.click(screen.getByRole('button', { name: /^Add as new/ }))
    expect(screen.queryByText(/Looks like/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Add/ }))
    expect(onCommit.mock.calls[0][0].items[0].sourceId).toBeUndefined()
  })

  it('above the week there is no goal or action choice — only where a line goes, and an optional kind after it', () => {
    renderSheet({
      altitude: 'month', today: new Date(2026, 8, 5), notes: [],
      items: [{ ...base, title: 'Read a book', placement: { kind: 'month' } }],
    })
    expect(screen.queryByRole('combobox', { name: 'What is "Read a book"?' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Where "Read a book" goes' })).toHaveValue('month')
    expect(screen.getByRole('combobox', { name: 'Kind of "Read a book" (optional)' })).toHaveValue('task')
    expect(screen.queryByRole('button', { name: /a goal$/ })).toBeNull()
  })

  it('a recurring line reads as a routine with its days, not a When select', () => {
    renderSheet({
      notes: [],
      items: [{ ...base, title: 'Trash out', kind: 'recurring', placement: { kind: 'week' }, recurring: { days: ['sat', 'sun'], until: null } }],
    })
    expect(screen.getByRole('combobox', { name: 'What is "Trash out"?' })).toHaveValue('routine')
    expect(screen.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('combobox', { name: 'When' })).toBeNull()
  })
})

describe('PageReviewSheet — linked lines and Year goals (Codex review, 2026-09-27)', () => {
  const base = { time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null }
  it('a linked line is locked and says it reuses the existing item unchanged; Unlink gives the controls back', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      altitude: 'season', windowDates: [], notes: [],
      items: [{ ...base, title: 'Renew the passports', placement: { kind: 'season' } }],
      existingTasks: [{ id: 'x1', title: 'Renew the passports', completed: false }],
    })
    // A word-for-word repeat starts linked (2026-09-29).
    expect(screen.getByRole('status')).toHaveTextContent(/already on your plan, exactly as it is — nothing new is saved for this line, and it is not put under a goal/)
    // No kind, no where: the line IS the existing item.
    expect(screen.queryByRole('combobox', { name: /goes$/i })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /Kind of/ })).toBeNull()
    expect(screen.getByText('Existing item')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Assignee for "Renew the passports"' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Don’t use it' }))
    expect(screen.getByRole('combobox', { name: 'Where "Renew the passports" goes' })).not.toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Kind of "Renew the passports" (optional)' })).toHaveValue('task')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0].sourceId).toBeUndefined()
  })

  it('a Year line becomes an appointment or a routine and back onto the year’s list — note and person kept', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      altitude: 'year', windowDates: [], notes: [],
      items: [{ ...base, title: 'Renew the passports', placement: { kind: 'goal' }, note: 'Both expire in March', assigneeId: 'm-iris' }],
    })
    const kind = screen.getByRole('combobox', { name: 'Kind of "Renew the passports" (optional)' })
    expect(kind).toHaveValue('task')
    expect(screen.getByRole('combobox', { name: 'Where "Renew the passports" goes' })).toHaveValue('goal')
    await user.selectOptions(kind, 'appointment')
    await user.selectOptions(kind, 'routine')
    await user.selectOptions(kind, 'task')                                                 // → back onto the year's list
    expect(screen.getByRole('combobox', { name: 'Where "Renew the passports" goes' })).toHaveValue('goal')
    expect(screen.getByText('Both expire in March')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Assignee for "Renew the passports"' })).toHaveValue('m-iris')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ placement: { kind: 'goal' }, note: 'Both expire in March', assigneeId: 'm-iris' })
  })
})

describe('PageReviewSheet — reuse wording (2026-09-27)', () => {
  it('offers "Use existing item" with an explanation that it avoids a duplicate and makes no goal link', () => {
    render(<PageReviewSheet items={[{ title: 'Look up music lessons', placement: { kind: 'month' }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task', recurring: null, phone: null, contactMemberId: null }]}
      notes={[]} unclear={[]} windowDates={[]} altitude="month" today={new Date(2026, 8, 5)} members={[]} committing={false}
      existingTasks={[{ id: 'x1', title: 'Look up music lessons for the kids' }]} onCommit={vi.fn()} onClose={vi.fn()} />)
    const use = screen.getByRole('button', { name: 'Use existing item' })
    expect(use).toHaveAccessibleDescription(/avoids a duplicate\. it doesn.t put the item under a goal/i)
    expect(screen.queryByRole('button', { name: /^Link$/ })).toBeNull()
  })
})

// 2026-09-29: the same Fall page imported twice saved all 23 goals twice — the
// sheet flagged each repeat but left it to be added as new unless each row's
// "Use existing item" was clicked.
describe('PageReviewSheet — a page imported again', () => {
  const row = (title: string) => ({ title, placement: { kind: 'season' as const }, time: null, assigneeId: null, note: null, dateHint: null, kind: 'task' as const, recurring: null, phone: null, contactMemberId: null, goal: true })
  it('a word-for-word repeat starts as the existing item and saves nothing new; a near-match is only offered', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<PageReviewSheet items={[row('Big kid skill: lights out'), row('Plan winter vacation'), row('Weed the garden')]}
      notes={[]} unclear={[]} windowDates={[]} altitude="season" today={new Date(2026, 9, 2)} members={[]} committing={false}
      existingTasks={[{ id: 'g1', title: 'Big kid skill — lights out' }, { id: 'g2', title: 'Plan winter vacation' }, { id: 'g3', title: 'Weed the whole garden' }]}
      onCommit={onCommit} onClose={vi.fn()} />)
    expect(screen.getByText(/Ready to add:/).parentElement).toHaveTextContent('2 already on your plan')
    expect(screen.getAllByRole('button', { name: 'Use existing item' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /^Add \d+ item/i }))
    const items = onCommit.mock.calls[0][0].items
    expect(items.map((i: { title: string; sourceId?: string }) => [i.title, i.sourceId])).toEqual([
      ['Big kid skill: lights out', 'g1'], ['Plan winter vacation', 'g2'], ['Weed the garden', undefined],
    ])
  })
})
