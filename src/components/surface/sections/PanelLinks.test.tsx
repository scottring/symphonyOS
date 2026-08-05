import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLinks } from './PanelLinks'

describe('PanelLinks', () => {
  it('renders nothing when no links and onAddLink not provided', () => {
    const { container } = render(<PanelLinks links={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders links with title and hostname fallback', () => {
    render(<PanelLinks
      links={[
        { url: 'https://example.com', title: 'Example' },
        { url: 'https://docs.example.com' },
      ]}
    />)
    expect(screen.getByText('Example')).toBeInTheDocument()
    expect(screen.getByText('docs.example.com')).toBeInTheDocument()
  })

  it('renders empty section with add input when onAddLink provided', () => {
    render(<PanelLinks links={[]} onAddLink={vi.fn()} />)
    expect(screen.getByText(/links/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/paste a url/i)).toBeInTheDocument()
  })

  it('calls onAddLink with url after Enter', async () => {
    const onAddLink = vi.fn()
    const { user } = render(<PanelLinks links={[]} onAddLink={onAddLink} />)
    const input = screen.getByPlaceholderText(/paste a url/i)
    await user.type(input, 'https://added.com{Enter}')
    expect(onAddLink).toHaveBeenCalledWith('https://added.com')
  })
})

describe('link facets', () => {
  // A saved link's whole point is the fact inside it. Once analyze-link has
  // read the page, that fact belongs on the card — not two taps away behind
  // a blue hostname.
  it('renders the facts read off an enriched link', () => {
    render(
      <PanelLinks
        links={[{
          url: 'https://example.com/booking',
          title: 'Cabin booking',
          analyzedAt: '2026-08-05T10:00:00Z',
          facets: [
            { type: 'summary', text: 'Lake cabin reservation for Labor Day weekend.' },
            { type: 'phone', label: 'Front desk', number: '+1 410-555-0100' },
          ],
        }]}
      />,
    )
    expect(screen.getByText(/Lake cabin reservation/)).toBeInTheDocument()
    expect(screen.getByText(/410-555-0100/)).toBeInTheDocument()
  })

  // Analysed, nothing worth keeping — and links saved before this shipped.
  // Both must render exactly as links always have.
  it('renders a plain link when there is nothing to show', () => {
    render(
      <PanelLinks
        links={[
          { url: 'https://example.com/a', title: 'Analysed, empty', analyzedAt: '2026-08-05T10:00:00Z', facets: [] },
          { url: 'https://example.com/b', title: 'Never analysed' },
        ]}
      />,
    )
    expect(screen.getByText('Analysed, empty')).toBeInTheDocument()
    expect(screen.getByText('Never analysed')).toBeInTheDocument()
  })
})
