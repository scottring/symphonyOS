import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DiscussionPopover } from './DiscussionPopover'

// Scott, 2026-09-22: "the text entry for mark for conversation is wonky, the
// cursor lags the input and causes overwriting previous characters". The
// textarea was controlled by the row's saved value and every keystroke was a
// database write, so the saved value came back stale over what was typed.
describe('DiscussionPopover — the note is a draft, saved after a pause', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps every keystroke on screen even while the saved value lags, and saves once after a pause', () => {
    const onChange = vi.fn()
    const view = render(<DiscussionPopover flagged note="" onChange={onChange} onClose={vi.fn()} />)
    const box = screen.getByPlaceholderText("What's the question?") as HTMLTextAreaElement
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'W' } })
    fireEvent.change(box, { target: { value: 'Wh' } })
    fireEvent.change(box, { target: { value: 'Who' } })
    expect(box.value).toBe('Who')
    expect(onChange).not.toHaveBeenCalled()
    // A stale save arriving mid-typing does not overwrite the draft.
    view.rerender(<DiscussionPopover flagged note="W" onChange={onChange} onClose={vi.fn()} />)
    expect(box.value).toBe('Who')
    act(() => { vi.advanceTimersByTime(700) })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'Who' })
  })

  it('saves on blur, flags an unflagged item once something is typed, and saves on unmount', () => {
    const onChange = vi.fn()
    const view = render(<DiscussionPopover flagged={false} note="" onChange={onChange} onClose={vi.fn()} />)
    const box = screen.getByPlaceholderText("What's the question?")
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Can we move it' } })
    fireEvent.blur(box)
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'Can we move it' })
    onChange.mockClear()
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'Can we move it to Friday' } })
    view.unmount()
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'Can we move it to Friday' })
  })

  it('the checkbox saves at once with the current draft; Clear empties and closes without a trailing save', () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    const view = render(<DiscussionPopover flagged note="Old question" onChange={onChange} onClose={onClose} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith({ flagged: false, note: 'Old question' })
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ flagged: false, note: '' })
    expect(onClose).toHaveBeenCalled()
    view.unmount()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
