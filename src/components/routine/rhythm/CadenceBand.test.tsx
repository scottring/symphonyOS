import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CadenceBand, nextLabel } from './CadenceBand'
import type { Routine } from '@/types/actionable'

let n = 0
const mk = (over: Partial<Routine>): Routine => ({
  id: `r${++n}`, name: 'R', is_active: true, visibility: 'active',
  recurrence_pattern: { type: 'monthly', day_of_month: 3 }, context: 'family', scope: 'compound',
  ...over,
} as Routine)

const NOW = new Date(2026, 8, 13) // Sun Sep 13 2026

const band = (props: Partial<Parameters<typeof CadenceBand>[0]> = {}) =>
  render(
    <CadenceBand
      heading="Monthly"
      routines={[mk({ name: 'Change the filter' })]}
      familyMembers={[]}
      stepCounts={{}}
      now={NOW}
      onOpenRoutine={vi.fn()}
      {...props}
    />,
  )

describe('CadenceBand', () => {
  it('says what it is, how often, and when it next lands', () => {
    band({ routines: [mk({ name: 'Change the filter', recurrence_pattern: { type: 'monthly', day_of_month: 3 } })] })
    const section = screen.getByRole('region', { name: 'Monthly' })
    expect(within(section).getByText('Change the filter')).toBeInTheDocument()
    // The app's one cadence vocabulary, plus the next date.
    expect(section.textContent).toContain('Monthly on the 3rd')
    expect(section.textContent).toMatch(/next Oct 3/)
  })

  it('is reference only — no tick, no checkbox, anywhere in it', () => {
    band()
    const section = screen.getByRole('region', { name: 'Monthly' })
    expect(within(section).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: /^Reopen/ })).not.toBeInTheDocument()
  })

  it('opens the routine itself — the pattern is edited in Routines', () => {
    const onOpenRoutine = vi.fn()
    const r = mk({ name: 'Change the filter' })
    band({ routines: [r], onOpenRoutine })
    fireEvent.click(screen.getByText('Change the filter'))
    expect(onOpenRoutine).toHaveBeenCalledWith(r)
  })

  it("its own add supplies the rung's recurrence, so only a name is asked for", () => {
    const onCreateInSlot = vi.fn()
    band({ routines: [], onCreateInSlot, createPattern: { type: 'quarterly' }, addLabel: 'Add a seasonal routine' })
    fireEvent.click(screen.getByRole('button', { name: 'Add a seasonal routine' }))
    const input = screen.getByLabelText('Add a seasonal routine')
    fireEvent.change(input, { target: { value: 'Swap the closets' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateInSlot).toHaveBeenCalledWith({ name: 'Swap the closets', recurrence_pattern: { type: 'quarterly' } })
  })

  it('a count that disagrees with the rows is not representable', () => {
    band({ routines: [mk({ name: 'A' }), mk({ name: 'B' })] })
    const section = screen.getByRole('region', { name: 'Monthly' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(2)
    expect(within(section).getByText('2')).toBeInTheDocument()
  })
})

describe('nextLabel', () => {
  it('a resting routine answers with its wake date, read in UTC', () => {
    // Stored at UTC midnight: read locally, a west-of-Greenwich clock drags
    // April back into March.
    const r = mk({ visibility: 'reference', paused_until: '2027-04-01T00:00:00.000Z' })
    expect(nextLabel(r, NOW, true)).toBe('wakes Apr 2027')
  })

  it('a resting routine with no wake date says nothing rather than guessing', () => {
    expect(nextLabel(mk({ visibility: 'reference' }), NOW, true)).toBeNull()
  })

  it("'since_last' has no calendar answer until it has been done", () => {
    const r = mk({ recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' } })
    expect(nextLabel(r, NOW, false)).toBeNull()
  })

  it('names the year only when the next one falls outside it', () => {
    const soon = nextLabel(mk({ recurrence_pattern: { type: 'monthly', day_of_month: 20 } }), NOW, false)
    expect(soon).toBe('next Sep 20')
    const far = nextLabel(mk({ recurrence_pattern: { type: 'yearly', month_of_year: 3 } }), NOW, false)
    expect(far).toMatch(/2027/)
  })
})
