import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { DomainsGoalsStep } from './DomainsGoalsStep'
import { renderStep, makeHost } from './testHarness'
import type { Goal, GoalArea } from '@/types/goal'

const step = {
  id: 'write-goals', type: 'domains-goals' as const, title: 'This year\'s goals',
  narration: 'Three to eight areas; write without censoring.',
}

describe('DomainsGoalsStep', () => {
  it('adds a goal statement under an area', () => {
    const host = makeHost({ goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea] })
    renderStep(<DomainsGoalsStep />, { step, host, horizon: 'annual' })
    const input = screen.getByPlaceholderText(/A goal for Health/)
    fireEvent.change(input, { target: { value: 'Sleep 7 hours' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.addGoal).toHaveBeenCalledWith('a1', 'Sleep 7 hours')
  })

  it('adds a new life domain', () => {
    const host = makeHost()
    renderStep(<DomainsGoalsStep />, { step, host, horizon: 'annual' })
    const input = screen.getByPlaceholderText(/New life area/)
    fireEvent.change(input, { target: { value: 'Fun' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.addArea).toHaveBeenCalledWith('Fun')
  })

  it('lists existing active goals under their area', () => {
    const host = makeHost({
      goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea],
      goals: [{ id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'a1' } as unknown as Goal],
    })
    renderStep(<DomainsGoalsStep />, { step, host, horizon: 'annual' })
    expect(screen.getByText('Run a 5k')).toBeInTheDocument()
  })
})
