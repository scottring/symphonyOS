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
    for (const name of ['Next month', 'This season', 'To a note…', 'To calendar…']) {
      expect(screen.getByRole('menuitem', { name }).getAttribute('data-tile')).toBe('true')
    }
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
