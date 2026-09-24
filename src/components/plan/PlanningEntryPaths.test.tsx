import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlanningEntryPaths } from './PlanningEntryPaths'

const show = (props: Parameters<typeof PlanningEntryPaths>[0] = {}) =>
  render(<MemoryRouter><PlanningEntryPaths {...props} /></MemoryRouter>)

describe('PlanningEntryPaths', () => {
  beforeEach(() => { localStorage.clear() })

  it('offers three doors and says that taking none of them is fine', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Capture something now' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plan the next few weeks' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Set a season or a year' })).toBeInTheDocument()
    expect(screen.getByLabelText('Somewhere to start')).toHaveTextContent(/pick one, or none/i)
    expect(screen.getByLabelText('Somewhere to start')).toHaveTextContent(/skipping all three leaves you exactly where you are/i)
  })

  // Each door does something the app already does. Capture goes through the
  // same signal the ⌘K unibox listens to, rather than a second capture path.
  it('the capture door asks the shell for its quick add', () => {
    const heard = vi.fn()
    window.addEventListener('symphony-quick-add-requested', heard)
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Write one line' }))
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener('symphony-quick-add-requested', heard)
  })

  it('links each planning door to the app action and to its printable sheet', () => {
    show()
    expect(screen.getByRole('link', { name: 'Go to the month' })).toHaveAttribute('href', '/month')
    expect(screen.getByRole('link', { name: 'Go to the season' })).toHaveAttribute('href', '/season')
    expect(screen.getByRole('link', { name: /print the month sheet/i })).toHaveAttribute('href', '/guide#month')
    expect(screen.getByRole('link', { name: /print the season sheet/i })).toHaveAttribute('href', '/guide#season')
    expect(screen.getByRole('link', { name: 'planning guide' })).toHaveAttribute('href', '/guide')
  })

  // A door never offers to take the reader where they already are, and never
  // puts a second copy of the page's own control beside it.
  it('says so, and offers nothing, when the reader is already on that page', () => {
    show({ here: 'weeks' })
    expect(screen.queryByRole('link', { name: 'Go to the month' })).toBeNull()
    expect(screen.getByText(/you’re on this page/i)).toBeInTheDocument()
    // The other door still travels.
    expect(screen.getByRole('link', { name: 'Go to the season' })).toBeInTheDocument()
    // The sheet stays reachable from the door you are standing in.
    expect(screen.getByRole('link', { name: /print the month sheet/i })).toBeInTheDocument()
  })

  it('marks the season door instead when that is the page', () => {
    show({ here: 'season' })
    expect(screen.queryByRole('link', { name: 'Go to the season' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Go to the month' })).toBeInTheDocument()
  })

  it('can be hidden for good, and brought back', () => {
    const { unmount } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Hide this' }))
    expect(screen.queryByLabelText('Somewhere to start')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show where to start' })).toBeInTheDocument()
    unmount()

    // Still hidden on the next visit — it is a decision, not a dismissal.
    show()
    expect(screen.queryByLabelText('Somewhere to start')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show where to start' }))
    expect(screen.getByLabelText('Somewhere to start')).toBeInTheDocument()
  })

  it('renders when storage cannot be read at all', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => show()).not.toThrow()
    expect(screen.getByLabelText('Somewhere to start')).toBeInTheDocument()
    getItem.mockRestore()
  })
})
