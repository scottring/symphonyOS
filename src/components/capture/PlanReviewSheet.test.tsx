import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PlanReviewSheet } from './PlanReviewSheet'
import type { PlanItem } from '@/lib/planParse'
import type { FamilyMember } from '@/types/family'

const WINDOW = ['2026-08-17', '2026-08-18', '2026-08-19']
const MEMBERS = [
  { id: 'm-iris', name: 'Iris' } as FamilyMember,
]
const ITEMS: PlanItem[] = [
  { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100', existing: null },
  { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null, existing: null },
]

function renderSheet(overrides: Partial<Parameters<typeof PlanReviewSheet>[0]> = {}) {
  const onCommit = vi.fn()
  const onClose = vi.fn()
  render(
    <PlanReviewSheet
      items={ITEMS}
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

describe('PlanReviewSheet', () => {
  it('renders every parsed item with its note', () => {
    renderSheet()
    expect(screen.getByDisplayValue('Call dentist')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Return library books')).toBeInTheDocument()
    expect(screen.getByText('410-555-0100')).toBeInTheDocument()
  })

  it('commits all included items with their placements', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('button', { name: /add 2 tasks/i }))
    expect(onCommit).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' } }),
      expect.objectContaining({ title: 'Return library books', placement: { kind: 'week' } }),
    ])
  })

  it('excludes an unchecked row and updates the button count', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('checkbox', { name: /include "Call dentist"/i }))
    await user.click(screen.getByRole('button', { name: /add 1 task/i }))
    expect(onCommit).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Return library books' }),
    ])
  })

  it('commits an edited placement', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    const selects = screen.getAllByRole('combobox', { name: /when/i })
    await user.selectOptions(selects[0], 'inbox')
    await user.click(screen.getByRole('button', { name: /add 2 tasks/i }))
    expect(onCommit.mock.calls[0][0][0].placement).toEqual({ kind: 'inbox' })
  })

  it('shows the unreadable-page empty state with no commit button', () => {
    renderSheet({ items: [] })
    expect(screen.getByText(/couldn.t read anything/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })
})

const matchedItem: PlanItem = {
  title: 'Call roofer',
  placement: { kind: 'date', date: '2026-08-20' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-roof', label: 'This week', placement: { kind: 'week' } },
}
const plainItem: PlanItem = {
  title: 'Pick up dry cleaning',
  placement: { kind: 'date', date: '2026-08-21' },
  assigneeId: null,
  note: null,
  existing: null,
}
const noOpItem: PlanItem = {
  title: 'Mulch beds',
  placement: { kind: 'week' },
  assigneeId: null,
  note: null,
  existing: { taskId: 't-mulch', label: 'This week', placement: { kind: 'week' } },
}

describe('PlanReviewSheet duplicate flags', () => {
  it('flags a matched row with where the task is now and where it will go', () => {
    renderSheet({ items: [matchedItem], windowDates: ['2026-08-20'] })
    expect(screen.getByText(/already in Symphony/i)).toBeInTheDocument()
    // Scoped to the "(label)" form so it can't also match the "When" select's
    // own <option>This week</option>, which is unrelated to this flag.
    expect(screen.getByText(/\(This week\)/)).toBeInTheDocument()
  })

  it('does not flag an unmatched row', () => {
    renderSheet({ items: [plainItem], windowDates: ['2026-08-21'] })
    expect(screen.queryByText(/already in Symphony/i)).not.toBeInTheDocument()
  })

  it('counts adds and moves separately on the commit button', () => {
    renderSheet({ items: [matchedItem, plainItem], windowDates: ['2026-08-20', '2026-08-21'] })
    expect(screen.getByRole('button', { name: /Add 1, move 1/i })).toBeInTheDocument()
  })

  it('says only Add when nothing matched', () => {
    renderSheet({ items: [plainItem], windowDates: ['2026-08-21'] })
    expect(screen.getByRole('button', { name: /Add 1 task/i })).toBeInTheDocument()
  })

  it('says only Move when everything matched', () => {
    renderSheet({ items: [matchedItem], windowDates: ['2026-08-20'] })
    expect(screen.getByRole('button', { name: /Move 1 task/i })).toBeInTheDocument()
  })

  it('marks a match already in the right place as no change and excludes it from the count', () => {
    renderSheet({ items: [noOpItem, plainItem], windowDates: ['2026-08-21'] })
    expect(screen.getByText(/no change/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add 1 task/i })).toBeInTheDocument()
  })

  it('excludes an unchecked matched row from the commit entirely', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({
      items: [matchedItem, plainItem],
      windowDates: ['2026-08-20', '2026-08-21'],
    })
    await user.click(screen.getByRole('checkbox', { name: /Call roofer/i }))
    await user.click(screen.getByRole('button', { name: /Add 1 task/i }))
    expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ title: 'Pick up dry cleaning' })])
  })

  it('recomputes the flag when the user changes the target placement', async () => {
    const user = userEvent.setup()
    renderSheet({ items: [noOpItem], windowDates: ['2026-08-20'] })
    expect(screen.getByText(/no change/i)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('When'), '2026-08-20')
    expect(screen.queryByText(/no change/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Move 1 task/i })).toBeInTheDocument()
  })
})
