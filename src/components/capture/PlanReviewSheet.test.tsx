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
  { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100' },
  { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null },
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
