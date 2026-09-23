import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { InboxUndoToast } from './InboxUndoToast'

describe('InboxUndoToast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders the message and Undo button', () => {
    render(<InboxUndoToast message="Sent to Week" onUndo={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('Sent to Week')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('calls onUndo when Undo clicked', () => {
    const onUndo = vi.fn()
    render(<InboxUndoToast message="Sent to Week" onUndo={onUndo} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss after durationMs', () => {
    const onDismiss = vi.fn()
    render(<InboxUndoToast message="x" onUndo={() => {}} onDismiss={onDismiss} durationMs={3000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3001)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when × clicked', () => {
    const onDismiss = vi.fn()
    render(<InboxUndoToast message="x" onUndo={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not render Undo button when onUndo is undefined', () => {
    render(<InboxUndoToast message="Deleted" onDismiss={() => {}} />)
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })
})

describe('InboxUndoToast failure reporting', () => {
  afterEach(() => vi.useRealTimers())

  it('a persistent entry (failed undo) does not time out; an ordinary one does', () => {
    vi.useFakeTimers()
    const stay = vi.fn()
    const { unmount } = render(<InboxUndoToast message="Couldn't undo that move" onUndo={vi.fn()} onDismiss={stay} actionLabel="Retry" persistent />)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(stay).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    unmount()
    const go = vi.fn()
    render(<InboxUndoToast message="Sent" onUndo={vi.fn()} onDismiss={go} />)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(go).toHaveBeenCalledOnce()
  })

  it('disables the action while an undo is running', () => {
    render(<InboxUndoToast message="Sent" onUndo={vi.fn()} onDismiss={vi.fn()} busy />)
    expect(screen.getByRole('button', { name: 'Undoing…' })).toBeDisabled()
  })
})
