import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PlanMeetingBar } from './PlanStatus'

const STEPS = [
  { key: 'lookback', label: 'Look back' }, { key: 'fixed', label: 'Fixed points' },
  { key: 'fill', label: 'Fill the week' }, { key: 'plan', label: 'The plan' },
]
const base = { period: 'week 41', prevName: 'last week', step: 2 as const, lookBack: true, why: 'Why.', onStep: vi.fn(), onLeave: vi.fn(), onSave: vi.fn(), saveLabel: 'Mark week 41 planned' }

// Scott, 2026-10-03: planning "more obviously sequential" — numbered steps,
// Back and Next, the save the last step's verb.
describe('PlanMeetingBar — a list of steps', () => {
  it('numbers each step and marks the current one, with Back and Next', () => {
    render(<PlanMeetingBar {...base} steps={STEPS} stepKey="fixed" onStepKey={vi.fn()} />)
    const bar = within(screen.getByRole('region', { name: 'Planning week 41' }))
    const buttons = bar.getAllByRole('button', { name: /^\d/ })
    expect(buttons.map((b) => b.textContent)).toEqual(['1Look back', '2Fixed points', '3Fill the week', '4The plan'])
    expect(buttons[1]).toHaveAttribute('aria-current', 'step')
    expect(bar.getByRole('button', { name: '← Back' })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Next: Fill the week →' })).toBeInTheDocument()
  })
  it('Next moves one step on', () => {
    const onStepKey = vi.fn()
    render(<PlanMeetingBar {...base} steps={STEPS} stepKey="fixed" onStepKey={onStepKey} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next: Fill the week →' }))
    expect(onStepKey).toHaveBeenCalledWith('fill')
  })
  it('on the last step, marking planned is the step’s verb and there is no Next', () => {
    render(<PlanMeetingBar {...base} steps={STEPS} stepKey="plan" onStepKey={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark week 41 planned' }).className).toBe('pv2-btn')
  })
  it('without steps, the two-step bar is unchanged', () => {
    render(<PlanMeetingBar {...base} period="October" prevName="September" saveLabel="Mark October planned" />)
    expect(screen.getByRole('button', { name: '1 Look back at September' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 Plan October' })).toHaveAttribute('aria-current', 'step')
  })
})
