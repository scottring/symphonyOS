import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { MoreSheet } from './MoreSheet'
import { MORE_GROUPS, isDestinationActive } from './moreDestinations'
function Location() { return <p data-testid="path">{useLocation().pathname}</p> }
const renderSheet = (path = '/today', close = vi.fn()) =>
  render(<MemoryRouter initialEntries={[path]}><MoreSheet isOpen onClose={close} /><Location /></MemoryRouter>)

describe('Phone secondary destinations', () => {
  it.each([['Someday', '/someday'], ['Notes', '/notes'], ['Documents', '/documents'], ['House', '/home'], ['Meal shelf', '/meals/shelf'], ['Settings', '/settings']])(
    'opens %s from More and closes the sheet', (label, route) => {
      const close = vi.fn()
      renderSheet('/today', close)
      expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByTestId('path')).toHaveTextContent(route)
      expect(close).toHaveBeenCalledOnce()
    })

  it('offers every desktop More destination on the phone', () => {
    renderSheet()
    for (const [, items] of MORE_GROUPS) for (const { label } of items) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('is a labelled dialog that takes focus and closes on Escape', () => {
    const close = vi.fn()
    renderSheet('/today', close)
    const dialog = screen.getByRole('dialog', { name: 'More destinations' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
  })

  it('marks the current page, including pages the old highlight missed', () => {
    renderSheet('/notes')
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Someday' })).not.toHaveAttribute('aria-current')
  })

  it('announces unread discussions in the button name', () => {
    render(<MemoryRouter><MoreSheet isOpen onClose={vi.fn()} discussionsUnread={3} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Discussions, 3 unread' })).toBeInTheDocument()
  })
})

describe('isDestinationActive', () => {
  it('matches a page and its children but not look-alike prefixes', () => {
    expect(isDestinationActive('/home', '/home/space/1')).toBe(true)
    expect(isDestinationActive('/home', '/homework')).toBe(false)
    expect(isDestinationActive('/meals/plan', '/meals')).toBe(true)
    expect(isDestinationActive('/today?welcome=1', '/today')).toBe(false)
  })

  it('opens the assistant from its own row, without navigating', () => {
    const ask = vi.fn()
    render(<MemoryRouter initialEntries={['/today']}><MoreSheet isOpen onClose={vi.fn()} onAskSymphony={ask} /><Location /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Symphony' }))
    expect(ask).toHaveBeenCalledOnce()
    expect(screen.getByTestId('path')).toHaveTextContent('/today')
  })
})
