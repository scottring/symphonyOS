import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CloseOut } from './FocusDeck'
import type { LineActions, LineVM } from './PlanLine'
import type { Task } from '@/types/task'

// The look-back counts a decision only once it saved (2026-10-08 review).
const vm = (id: string, title: string): LineVM => ({ task: { id, title, completed: false, createdAt: new Date() } as Task, fate: 'open', partOf: null, where: null })
const actions = { done: vi.fn(), carry: vi.fn(), someday: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as LineActions

describe('CloseOut — a decision that did not save', () => {
  it('stays on the same card, uncounted, and moves on only once a retry saves', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const onDecide = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const lines = [vm('a', 'Book the boiler service'), vm('b', 'Return the drill')]
    const { rerender } = render(<CloseOut lines={lines} candidateIds={['a', 'b']} members={[]} actions={actions} prevName="September" nextName="October" onDecide={onDecide} onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Carry to October' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t counted as decided')
    // The caller's list loses the row (its first write half-landed): the card stays.
    rerender(<CloseOut lines={[lines[1]]} candidateIds={['a', 'b']} members={[]} actions={actions} prevName="September" nextName="October" onDecide={onDecide} onFinish={vi.fn()} />)
    expect(screen.getByText('Book the boiler service')).toBeInTheDocument()
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry to October' }))
    await waitFor(() => expect(screen.getByText(/2 of 2/)).toBeInTheDocument())
    expect(screen.getByText('Return the drill')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('while a decision is saving, nothing navigates; the card that was decided is the one that moves on', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    let finish!: (v: boolean) => void
    const onDecide = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>((r) => { finish = r }))
    const lines = [vm('a', 'Book the boiler service'), vm('b', 'Return the drill'), vm('c', 'Renew the parking permit')]
    render(<CloseOut lines={lines} candidateIds={['a', 'b', 'c']} members={[]} actions={actions} prevName="September" nextName="October" onDecide={onDecide} onFinish={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Leave it in September' }))
    await waitFor(() => expect(screen.getByText(/2 of 3/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Carry to October' })) // card b, saving…
    expect(screen.getByRole('button', { name: '← Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Carry to October' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '← Previous' }))
    expect(screen.getByText('Return the drill')).toBeInTheDocument()
    finish(true)
    await waitFor(() => expect(screen.getByText(/3 of 3/)).toBeInTheDocument())
    expect(screen.getByText('Renew the parking permit')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
