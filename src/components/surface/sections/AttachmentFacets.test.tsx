import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { AttachmentFacets, facetsToText } from './AttachmentFacets'
import type { Facet } from '@/types/facets'

const all: Facet[] = [
  { type: 'summary', text: 'Airbnb confirmation' },
  { type: 'location', label: 'The house', address: '4 Beach Ave, Kennebunkport ME' },
  { type: 'access_code', label: 'Door code', code: '4482#' },
  { type: 'phone', label: 'Host', number: '+1 207 555 0101' },
  { type: 'datetime', label: 'Check-in', iso: '2026-07-18T16:00:00' },
  { type: 'link', label: 'Trip page', url: 'https://airbnb.com/trips/x' },
  { type: 'checklist', label: 'Before you go', items: ['Bring towels'] },
  { type: 'purchase_item', name: 'T8 bulb', specs: '18W 4-pin' },
]

describe('AttachmentFacets', () => {
  it('renders nothing for empty facets', () => {
    const { container } = render(<AttachmentFacets facets={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders every facet type', () => {
    render(<AttachmentFacets facets={all} />)
    expect(screen.getByText('Airbnb confirmation')).toBeInTheDocument()
    expect(screen.getByText(/4 Beach Ave, Kennebunkport ME/)).toBeInTheDocument()
    expect(screen.getByText('4482#')).toBeInTheDocument()
    expect(screen.getByText(/555 0101/)).toBeInTheDocument()
    expect(screen.getByText(/Check-in/)).toBeInTheDocument()
    expect(screen.getByText('Trip page')).toBeInTheDocument()
    expect(screen.getByText('Bring towels')).toBeInTheDocument()
    expect(screen.getByText(/T8 bulb/)).toBeInTheDocument()
  })

  it('location gets a maps href; phone gets tel:; link gets its url', () => {
    render(<AttachmentFacets facets={all} />)
    expect(screen.getByRole('link', { name: /4 Beach Ave/ }).getAttribute('href')).toContain('maps')
    expect(screen.getByRole('link', { name: /555 0101/ })).toHaveAttribute('href', 'tel:+1 207 555 0101')
    expect(screen.getByRole('link', { name: 'Trip page' })).toHaveAttribute('href', 'https://airbnb.com/trips/x')
  })

  it('copies an access code', async () => {
    const { user } = render(<AttachmentFacets facets={[all[2]]} />)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('4482#')
  })

  it('offers promotions only when handlers exist, and calls them', async () => {
    const onUseLocation = vi.fn()
    const onAddPrepTask = vi.fn()
    const onAddLink = vi.fn()
    const onSetPhone = vi.fn()
    const { user } = render(
      <AttachmentFacets facets={all} promotions={{ onUseLocation, onAddPrepTask, onAddLink, onSetPhone }} />,
    )
    await user.click(screen.getByRole('button', { name: 'Use as location' }))
    expect(onUseLocation).toHaveBeenCalledWith('4 Beach Ave, Kennebunkport ME')
    await user.click(screen.getByRole('button', { name: 'Add "Bring towels" as prep task' }))
    expect(onAddPrepTask).toHaveBeenCalledWith('Bring towels')
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    expect(onAddLink).toHaveBeenCalledWith('https://airbnb.com/trips/x')
    await user.click(screen.getByRole('button', { name: 'Save phone number' }))
    expect(onSetPhone).toHaveBeenCalledWith('+1 207 555 0101')
  })

  it('offers a copy button on every value chip', async () => {
    const { user } = render(<AttachmentFacets facets={all} />)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(writeText).toHaveBeenLastCalledWith('4 Beach Ave, Kennebunkport ME')
    await user.click(screen.getByRole('button', { name: 'Copy phone number' }))
    expect(writeText).toHaveBeenLastCalledWith('+1 207 555 0101')
    await user.click(screen.getByRole('button', { name: 'Copy date' }))
    expect(writeText).toHaveBeenLastCalledWith('Sat, Jul 18, 4:00 PM')
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenLastCalledWith('https://airbnb.com/trips/x')
    await user.click(screen.getByRole('button', { name: 'Copy checklist' }))
    expect(writeText).toHaveBeenLastCalledWith('Bring towels')
    await user.click(screen.getByRole('button', { name: 'Copy item' }))
    expect(writeText).toHaveBeenLastCalledWith('T8 bulb — 18W 4-pin')
  })

  it('serializes the whole parse as plain text, summary first', () => {
    expect(facetsToText(all)).toBe(
      [
        'Airbnb confirmation',
        'The house: 4 Beach Ave, Kennebunkport ME',
        'Door code: 4482#',
        'Host: +1 207 555 0101',
        'Check-in: Sat, Jul 18, 4:00 PM',
        'Trip page: https://airbnb.com/trips/x',
        'Before you go:',
        '- Bring towels',
        'T8 bulb — 18W 4-pin',
      ].join('\n'),
    )
  })

  it('omits labels it does not have when serializing', () => {
    expect(
      facetsToText([
        { type: 'phone', number: '555-0101' },
        { type: 'checklist', items: ['a', 'b'] },
      ]),
    ).toBe(['555-0101', 'Checklist:', '- a', '- b'].join('\n'))
  })

  it('Copy all copies the serialized parse', async () => {
    const { user } = render(<AttachmentFacets facets={all} />)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: 'Copy all' }))
    expect(writeText).toHaveBeenCalledWith(facetsToText(all))
  })

  it('hides Copy all when there is only one facet', () => {
    render(<AttachmentFacets facets={[all[2]]} />)
    expect(screen.queryByRole('button', { name: 'Copy all' })).not.toBeInTheDocument()
  })

  it('renders no promotion buttons without handlers', () => {
    render(<AttachmentFacets facets={all} />)
    expect(screen.queryByRole('button', { name: 'Use as location' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save link' })).not.toBeInTheDocument()
  })
})
