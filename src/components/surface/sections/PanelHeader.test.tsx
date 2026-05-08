import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelHeader } from './PanelHeader'

describe('PanelHeader', () => {
  it('renders title', () => {
    render(<PanelHeader title="Call Dr. Smith" onTitleChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Call Dr. Smith')).toBeInTheDocument()
  })

  it('switches to input on click and saves on blur', async () => {
    const onTitleChange = vi.fn()
    const { user } = render(<PanelHeader title="Old title" onTitleChange={onTitleChange} onClose={vi.fn()} />)
    await user.click(screen.getByText('Old title'))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'New title')
    input.blur()
    expect(onTitleChange).toHaveBeenCalledWith('New title')
  })

  it('does not call onTitleChange when value unchanged', async () => {
    const onTitleChange = vi.fn()
    const { user } = render(<PanelHeader title="Same" onTitleChange={onTitleChange} onClose={vi.fn()} />)
    await user.click(screen.getByText('Same'))
    screen.getByRole('textbox').blur()
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const { user } = render(<PanelHeader title="x" onTitleChange={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
