import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
