import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionPopover } from './DiscussionPopover'

// Split out of DiscussionPicker so the Today row's '...' menu can open it
// without an icon trigger. These cover the behaviour that moved with it.
describe('DiscussionPopover', () => {
  it('auto-flags when the user types a note on an unflagged item', () => {
    const onChange = vi.fn()
    render(<DiscussionPopover flagged={false} note="" onChange={onChange} onClose={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText("What's the question?"), {
      target: { value: 'which vendor?' },
    })

    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'which vendor?' })
  })

  it('does not offer Clear until the item is flagged', () => {
    render(<DiscussionPopover flagged={false} note="" onChange={() => {}} onClose={() => {}} />)

    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('clearing unflags, empties the note, and closes', () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(<DiscussionPopover flagged note="which vendor?" onChange={onChange} onClose={onClose} />)

    fireEvent.click(screen.getByText('Clear'))

    expect(onChange).toHaveBeenCalledWith({ flagged: false, note: '' })
    expect(onClose).toHaveBeenCalled()
  })

  it('toggling the checkbox flags without touching the note', () => {
    const onChange = vi.fn()
    render(<DiscussionPopover flagged={false} note="draft" onChange={onChange} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'draft' })
  })

  it('focuses the note when opened on an already-flagged item', () => {
    render(<DiscussionPopover flagged note="ask Iris" onChange={() => {}} onClose={() => {}} />)

    expect(screen.getByPlaceholderText("What's the question?")).toHaveFocus()
  })
})
