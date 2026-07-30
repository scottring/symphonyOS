import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { linkifyText } from './linkifyText'

describe('linkifyText', () => {
  it('turns an embedded URL into a real link and keeps the sentence', () => {
    render(<p>{linkifyText('Last: Opened https://www.etsy.com/search?q=wall+posters — success · today')}</p>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://www.etsy.com/search?q=wall+posters')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText(/Last: Opened/)).toBeInTheDocument()
    expect(screen.getByText(/success/)).toBeInTheDocument()
  })

  it('leaves text with no URL untouched', () => {
    render(<p>{linkifyText('Last: called — voicemail · yesterday')}</p>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not swallow trailing sentence punctuation into the href', () => {
    render(<p>{linkifyText('see https://example.com/page.')}</p>)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/page')
  })

  it('handles several URLs in one string', () => {
    render(<p>{linkifyText('a https://one.test b https://two.test c')}</p>)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
