import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { InboxTriageActions } from './InboxTriageActions'

// Scott, 2026-10-04: "the top half is beautifully formatted, the bottom half
// not so much". The whole menu wears the grid's tiles.
describe('InboxTriageActions — one look for the whole menu', () => {
  const open = (area: 'family' | null = 'family') => {
    const props = { title: 'Fix gate', onPick: vi.fn(), onPickDate: vi.fn(), onNote: vi.fn(), onSendToCalendar: vi.fn(), onSetArea: vi.fn(), onDelete: vi.fn(), area }
    render(<InboxTriageActions {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Fix gate' }))
    return props
  }

  it('later periods and sending are tiles, like the dates above them', () => {
    open()
    // Next month and This season are now the shared When grid's own tiles
    // (the triage contract), each naming where it lands.
    for (const name of [/^Next month/, /^This season/]) {
      expect(screen.getByRole('menuitem', { name }).closest('[data-tile]')).not.toBeNull()
    }
    for (const name of ['To a note…', 'To calendar…']) {
      expect(screen.getByRole('menuitem', { name }).getAttribute('data-tile')).toBe('true')
    }
  })

  it('offers the whole When group in the contract’s order, Tomorrow and Next week each named with their dates', () => {
    open()
    const when = screen.getAllByRole('menuitem').map((b) => b.textContent ?? '').filter((t) => /^(Today|Tonight|Tomorrow|This|Next|Someday|Pick date)/.test(t))
    expect(when.map((t) => t.match(/^(Today|Tonight|Tomorrow|This weekend|Next weekend|This week|Next week|This month|Next month|This season|Someday|Pick date & time…)/)?.[1])).toEqual([
      'Today', 'Tonight', 'Tomorrow', 'This week', 'Next week', 'This weekend', 'Next weekend', 'This month', 'Next month', 'This season', 'Someday', 'Pick date & time…',
    ])
  })

  it('life area is one row of chips, the current one marked', () => {
    const p = open('family')
    const areas = within(screen.getByRole('group', { name: 'Life area' }))
    expect(areas.getByRole('menuitemradio', { name: 'Family' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(areas.getByRole('menuitemradio', { name: 'Work' }))
    expect(p.onSetArea).toHaveBeenCalledWith('work')
  })

  it('delete is a tile of its own', () => {
    const p = open()
    const del = screen.getByRole('menuitem', { name: 'Delete' })
    expect(del.getAttribute('data-tile')).toBe('true')
    fireEvent.click(del)
    expect(p.onDelete).toHaveBeenCalled()
  })
})
