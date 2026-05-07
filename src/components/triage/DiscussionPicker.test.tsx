import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionPicker } from './DiscussionPicker'

describe('DiscussionPicker', () => {
  it('renders unflagged state with neutral icon', () => {
    render(<DiscussionPicker flagged={false} note="" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: /needs discussion/i })
    expect(button.className).toMatch(/text-neutral/)
  })

  it('renders flagged state with primary tint', () => {
    render(<DiscussionPicker flagged={true} note="" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: /needs discussion/i })
    expect(button.className).toMatch(/text-primary/)
  })

  it('opens popover on click and toggles flag', () => {
    const onChange = vi.fn()
    render(<DiscussionPicker flagged={false} note="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /needs discussion/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /needs discussion/i }))
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: '' })
  })

  it('passes note through onChange when textarea changes', () => {
    const onChange = vi.fn()
    render(<DiscussionPicker flagged={true} note="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /needs discussion/i }))
    const textarea = screen.getByPlaceholderText(/what's the question/i)
    fireEvent.change(textarea, { target: { value: 'Push delivery?' } })
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'Push delivery?' })
  })

  it('shows clear button only when flagged, calls onChange with flagged=false', () => {
    const onChange = vi.fn()
    render(<DiscussionPicker flagged={true} note="hello" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /needs discussion/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith({ flagged: false, note: '' })
  })
})
