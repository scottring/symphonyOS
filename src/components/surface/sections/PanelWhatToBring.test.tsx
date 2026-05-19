import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelWhatToBring } from './PanelWhatToBring'

describe('PanelWhatToBring', () => {
  it('renders nothing when empty and no onChange', () => {
    const { container } = render(<PanelWhatToBring notes={undefined} />)
    expect(container.firstChild).toBeNull()
  })
  it('renders the WHAT TO BRING eyebrow and notes text (read-only)', () => {
    render(<PanelWhatToBring notes={'Navy beans if out of cannellini'} />)
    expect(screen.getByText(/what to bring/i)).toBeInTheDocument()
    expect(screen.getByText('Navy beans if out of cannellini')).toBeInTheDocument()
  })
  it('renders an editable textarea when onChange provided and calls it on blur', async () => {
    const onChange = vi.fn()
    const { user } = render(<PanelWhatToBring notes={''} onChange={onChange} />)
    const ta = screen.getByPlaceholderText(/add notes/i)
    await user.type(ta, 'salad bowl')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith('salad bowl')
  })
})
