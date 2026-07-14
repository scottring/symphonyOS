// src/components/surface/sections/RoutineStepsSection.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RoutineStepsSection } from './RoutineStepsSection'
import type { Routine } from '@/types/actionable'

function step(id: string, name: string, order: number): Routine {
  return {
    id, user_id: 'u1', name, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    parent_routine_id: 'c1', step_order: order,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

function setup(overrides = {}) {
  const props = {
    steps: [step('s1', 'Chin tuck', 0), step('s2', 'Nerve glide', 1)],
    onSelectStep: vi.fn(), onAddStep: vi.fn(), onReorderSteps: vi.fn(), ...overrides,
  }
  render(<RoutineStepsSection {...props} />)
  return props
}

describe('RoutineStepsSection', () => {
  it('renders each step', () => {
    setup()
    expect(screen.getByText('Chin tuck')).toBeInTheDocument()
    expect(screen.getByText('Nerve glide')).toBeInTheDocument()
  })
  it('adding a step reports the typed name', () => {
    const { onAddStep } = setup()
    fireEvent.change(screen.getByLabelText(/add a step/i), { target: { value: 'Pendulum' } })
    fireEvent.click(screen.getByRole('button', { name: /^add step$/i }))
    expect(onAddStep).toHaveBeenCalledWith('Pendulum')
  })
  it('clicking a step opens it', () => {
    const { onSelectStep } = setup()
    fireEvent.click(screen.getByText('Chin tuck'))
    expect(onSelectStep).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  describe('today checklist', () => {
    it('renders no checkboxes without checklist props', () => {
      setup()
      expect(screen.queryByRole('button', { name: /done for today/i })).not.toBeInTheDocument()
    })

    it('renders a checkbox per step in the map and toggles it', () => {
      const onToggleStep = vi.fn()
      const { steps } = setup({
        checkedByStep: new Map([['s1', false], ['s2', true]]),
        onToggleStep,
      }) as { steps: Routine[]; onToggleStep: ReturnType<typeof vi.fn> }
      fireEvent.click(screen.getByRole('button', { name: 'Mark Chin tuck done for today' }))
      expect(onToggleStep).toHaveBeenCalledWith(expect.objectContaining({ id: steps[0].id }))
      // A checked step offers the reverse action
      expect(screen.getByRole('button', { name: 'Mark Nerve glide not done for today' })).toBeInTheDocument()
    })

    it('steps missing from the map (not scheduled today) get no checkbox', () => {
      setup({ checkedByStep: new Map([['s1', false]]), onToggleStep: vi.fn() })
      expect(screen.getByRole('button', { name: /mark chin tuck done/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /nerve glide.*today/i })).not.toBeInTheDocument()
    })
  })
})
