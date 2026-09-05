import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PageReviewSheet } from './PageReviewSheet'
import type { PlanItem } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'

const WINDOW = ['2026-08-17', '2026-08-18', '2026-08-19']
const MEMBERS = [{ id: 'm-iris', name: 'Iris' } as FamilyMember]
const ITEMS: PlanItem[] = [
  { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100' },
  { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null },
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
    expect(onCommit).toHaveBeenCalledWith({ items: expect.any(Array), notes: [] })
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
        { title: 'Half marathon', placement: { kind: 'goal' }, time: null, assigneeId: null, note: null },
        { title: 'Book Iceland flights', placement: { kind: 'season' }, time: null, assigneeId: null, note: null },
      ],
    })
    expect(screen.getByText('Goal')).toBeInTheDocument()
    expect(screen.getByText(/read as a year page/i)).toBeInTheDocument()
    expect(screen.getByText(/1 task \/ 1 goal/)).toBeInTheDocument()
    const whens = screen.getAllByRole('combobox', { name: /when/i })
    expect(Array.from(whens[1].querySelectorAll('option')).map((o) => o.textContent)).toContain('Year goal')
    await user.selectOptions(whens[0], 'someday')
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit.mock.calls[0][0].items.map((i: { placement: unknown }) => i.placement)).toEqual([{ kind: 'someday' }, { kind: 'season' }])
  })
})
