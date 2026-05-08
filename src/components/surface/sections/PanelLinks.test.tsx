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
