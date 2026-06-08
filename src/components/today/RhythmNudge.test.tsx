import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { RhythmNudge } from './RhythmNudge'

describe('RhythmNudge', () => {
  beforeEach(() => localStorage.clear())

  it('renders nothing when nothing is due', () => {
    const { container } = render(<RhythmNudge due={null} onPlan={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the plan-the-week nudge when due and fires onPlan', async () => {
    const onPlan = vi.fn()
    const { user } = render(<RhythmNudge due={{ kind: 'week', label: 'the week', token: 'wk-1' }} onPlan={onPlan} />)
    expect(screen.getByText(/good time to/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Plan the week' }))
    expect(onPlan).toHaveBeenCalled()
  })

  it('dismiss hides it for the current week token', async () => {
    const { user, rerender } = render(<RhythmNudge due={{ kind: 'week', label: 'the week', token: 'wk-1' }} onPlan={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/good time to/i)).not.toBeInTheDocument()
    // Same token after rerender stays dismissed
    rerender(<RhythmNudge due={{ kind: 'week', label: 'the week', token: 'wk-1' }} onPlan={vi.fn()} />)
    expect(screen.queryByText(/good time to/i)).not.toBeInTheDocument()
  })

  it('returns next week (new token) even after a prior dismissal', () => {
    localStorage.setItem('symphony-rhythm-nudge-dismissed', 'wk-1')
    render(<RhythmNudge due={{ kind: 'week', label: 'the week', token: 'wk-2' }} onPlan={vi.fn()} />)
    expect(screen.getByText(/good time to/i)).toBeInTheDocument()
  })
})
