import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InboxModeToggle } from './InboxModeToggle'

describe('InboxModeToggle', () => {
  it('renders both options with current selected', () => {
    render(<InboxModeToggle mode="dense" onChange={() => {}} />)
    const dense = screen.getByRole('button', { name: /list view/i })
    const focus = screen.getByRole('button', { name: /focus mode/i })
    expect(dense).toHaveAttribute('aria-pressed', 'true')
    expect(focus).toHaveAttribute('aria-pressed', 'false')
  })

  it('fires onChange when other option clicked', () => {
    const onChange = vi.fn()
    render(<InboxModeToggle mode="dense" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }))
    expect(onChange).toHaveBeenCalledWith('focus')
  })

  it('does not fire onChange when clicking the already-active option', () => {
    const onChange = vi.fn()
    render(<InboxModeToggle mode="dense" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /list view/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
