import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChangeCard } from './ChangeCard'
import type { PendingChangeSet } from '@/contexts/CanvasActivityContext'

const pending = (x: Partial<PendingChangeSet> = {}): PendingChangeSet => ({
  key: 's', title: '2 changes to your week', state: 'proposed', ops: [
    { key: 's:0', op: 'place', taskId: 'a', title: 'Reply to Christian', date: '2026-10-14', time: '09:00' },
    { key: 's:1', op: 'someday', taskId: 'b', title: 'Paper mail' },
  ], ...x,
})

describe('ChangeCard', () => {
  const today = new Date(2026, 9, 14, 8)
  it('lists every change with its kind and where it lands', () => {
    render(<ChangeCard set={pending()} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('region', { name: '2 changes to your week' })).toBeInTheDocument()
    expect(screen.getByText('Reply to Christian')).toBeInTheDocument()
    expect(screen.getByText('→ Today 9:00')).toBeInTheDocument()
    expect(screen.getByText('LATER')).toBeInTheDocument()
    expect(screen.getByText('Nothing is saved until you approve.')).toBeInTheDocument()
  })
  it('one Approve for all of them; Dismiss drops the card', () => {
    const onApprove = vi.fn(), onDismiss = vi.fn()
    render(<ChangeCard set={pending()} today={today} onApprove={onApprove} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve all 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
  it('while saving, Approve is disabled; a failure shows its reason', () => {
    const { rerender } = render(<ChangeCard set={pending({ state: 'saving' })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    rerender(<ChangeCard set={pending({ state: 'failed', message: "Couldn't save. Nothing was changed. Try again." })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Nothing was changed. Try again.")
  })
  it('says when it replaced an earlier list', () => {
    render(<ChangeCard set={pending({ replaced: true })} today={today} onApprove={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('This replaces the earlier list.')).toBeInTheDocument()
  })
})
