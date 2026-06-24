import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PanelMedia } from './PanelMedia'

describe('PanelMedia', () => {
  it('renders nothing when no media', () => {
    const { container } = render(<PanelMedia />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders the image when imageUrl is set', () => {
    render(<PanelMedia imageUrl="https://x/y.png" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/y.png')
  })
  it('renders a source-document row and fires onOpen', async () => {
    const onOpen = vi.fn()
    render(<PanelMedia sourceDoc={{ fileName: 'shoulder-hep.pdf', onOpen }} />)
    screen.getByText('shoulder-hep.pdf').click()
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
