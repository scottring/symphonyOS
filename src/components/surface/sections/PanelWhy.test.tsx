import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelWhy } from './PanelWhy'

describe('PanelWhy', () => {
  it('renders notes when present', () => {
    render(<PanelWhy notes="ear pulling 3 days" onChange={vi.fn()} />)
    expect(screen.getByText(/ear pulling 3 days/)).toBeInTheDocument()
  })

  it('renders nothing when notes are empty and onChange not given', () => {
    const { container } = render(<PanelWhy notes="" onChange={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows editable input when clicked', async () => {
    const { user } = render(<PanelWhy notes="hello" onChange={vi.fn()} />)
    await user.click(screen.getByText('hello'))
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('calls onChange with new value on blur', async () => {
    const onChange = vi.fn()
    const { user } = render(<PanelWhy notes="hello" onChange={onChange} />)
    await user.click(screen.getByText('hello'))
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.clear(ta)
    await user.type(ta, 'updated')
    ta.blur()
    expect(onChange).toHaveBeenCalledWith('updated')
  })
})
