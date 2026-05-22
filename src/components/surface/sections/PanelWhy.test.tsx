import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelWhy } from './PanelWhy'

describe('PanelWhy', () => {
  it('renders notes when present', () => {
    render(<PanelWhy notes="<p>ear pulling 3 days</p>" onChange={vi.fn()} />)
    expect(screen.getByText(/ear pulling 3 days/)).toBeInTheDocument()
  })

  it('renders nothing when notes are empty and onChange not given', () => {
    const { container } = render(<PanelWhy notes="" onChange={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders editor when clicked and onChange provided', async () => {
    const { user } = render(<PanelWhy notes="<p>hello</p>" onChange={vi.fn()} />)
    await user.click(screen.getByText(/hello/))
    // After click, the click-to-edit trigger (the button showing the note text)
    // is replaced by the editor. (A persistent expand button remains in the header.)
    expect(screen.queryByRole('button', { name: /hello/ })).not.toBeInTheDocument()
  })

  it('does not switch to editor when read-only (no onChange)', async () => {
    const { user } = render(<PanelWhy notes="<p>hello</p>" />)
    await user.click(screen.getByText(/hello/))
    // Button should still be present (disabled, click was a no-op)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
