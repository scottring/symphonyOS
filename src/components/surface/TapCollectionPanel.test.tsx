// src/components/surface/TapCollectionPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapCollectionPanel } from './TapCollectionPanel'
import type { Routine, RoutineWithSteps } from '@/types/actionable'

function step(id: string, name: string, order: number): Routine {
  return {
    id, user_id: 'u1', name, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    parent_routine_id: 'c1', step_order: order,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Routine
}

const collection: RoutineWithSteps = {
  id: 'c1', user_id: 'u1', name: 'Shoulder HEP', recurrence_pattern: { type: 'daily' },
  visibility: 'active', context: 'personal',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  steps: [step('s1', 'Chin tuck', 0), step('s2', 'Nerve glide', 1)],
} as RoutineWithSteps

function setup(overrides = {}) {
  const props = {
    collection, onClose: vi.fn(), onRename: vi.fn(), onContextChange: vi.fn(),
    onScheduleChange: vi.fn(), onNotesChange: vi.fn(), onSelectStep: vi.fn(),
    onAddStep: vi.fn(), onReorderSteps: vi.fn(), ...overrides,
  }
  render(<TapCollectionPanel {...props} />)
  return props
}

describe('TapCollectionPanel', () => {
  it('renders the collection name and each step', () => {
    setup()
    expect(screen.getByText('Shoulder HEP')).toBeInTheDocument()
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
})
