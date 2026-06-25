import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapStepPanel } from './TapStepPanel'
import type { Routine } from '@/types/actionable'

const step: Routine = {
  id: 's1', user_id: 'u1', name: 'Chin tuck', description: 'Tuck chin, hold 5s',
  recurrence_pattern: { type: 'daily' }, visibility: 'active',
  times_per_day: ['09:00', '18:00'], parent_routine_id: 'c1', step_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
} as Routine

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    step, parentName: 'Shoulder HEP', onClose: vi.fn(), onRename: vi.fn(),
    onDosesChange: vi.fn(), onNotesChange: vi.fn(), onPromote: vi.fn(),
    onScheduleChange: vi.fn(), ...overrides,
  }
  render(<TapStepPanel {...props} />)
  return props
}

describe('TapStepPanel', () => {
  it('renders the step name and its dose times', () => {
    setup()
    expect(screen.getByText('Chin tuck')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  it('shows the inherited parent as read-only context (without "schedule")', () => {
    setup()
    expect(screen.getByText(/Context and people are/i)).toBeInTheDocument()
    expect(screen.getByText(/inherited from Shoulder HEP/i)).toBeInTheDocument()
    expect(screen.queryByText(/schedule/i)).not.toBeInTheDocument()
  })

  it('removing a dose reports the remaining times', () => {
    const { onDosesChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: /remove 09:00/i }))
    expect(onDosesChange).toHaveBeenCalledWith(['18:00'])
  })

  it('promotes the step to standalone', () => {
    const { onPromote } = setup()
    fireEvent.click(screen.getByRole('button', { name: /remove from routine/i }))
    expect(onPromote).toHaveBeenCalled()
  })

  it('shows "Same as routine" by default for an inheriting (daily) step', () => {
    setup({ step: { ...step, recurrence_pattern: { type: 'daily' } } as Routine })
    expect(screen.getByRole('button', { name: /same as routine/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switching to specific days and picking a day reports a weekly pattern', () => {
    const onScheduleChange = vi.fn()
    setup({ step: { ...step, recurrence_pattern: { type: 'daily' } } as Routine, onScheduleChange })
    fireEvent.click(screen.getByRole('button', { name: /specific days/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Mon$/i }))
    expect(onScheduleChange).toHaveBeenCalled()
    const arg = onScheduleChange.mock.calls.at(-1)![0]
    expect(arg.type).toBe('weekly')
    expect(arg.days).toContain('mon')
  })

  it('choosing "Same as routine" reverts to an inheriting daily pattern', () => {
    const onScheduleChange = vi.fn()
    setup({ step: { ...step, recurrence_pattern: { type: 'weekly', days: ['mon'] } } as Routine, onScheduleChange })
    fireEvent.click(screen.getByRole('button', { name: /same as routine/i }))
    expect(onScheduleChange).toHaveBeenCalledWith({ type: 'daily' })
  })

  it('labels the promote action "Remove from routine"', () => {
    setup()
    expect(screen.getByRole('button', { name: /remove from routine/i })).toBeInTheDocument()
  })

  it('clicking "Specific days" alone does NOT call onScheduleChange with empty weekly days', () => {
    const onScheduleChange = vi.fn()
    setup({ step: { ...step, recurrence_pattern: { type: 'daily' } } as Routine, onScheduleChange })
    fireEvent.click(screen.getByRole('button', { name: /specific days/i }))
    // onScheduleChange must not have been called with {type:'weekly', days:[]}
    const emptyWeeklyCalls = onScheduleChange.mock.calls.filter(
      ([arg]) => arg.type === 'weekly' && Array.isArray(arg.days) && arg.days.length === 0
    )
    expect(emptyWeeklyCalls).toHaveLength(0)
  })

  it('removing the last specific day reverts to {type:"daily"} (inherit)', () => {
    const onScheduleChange = vi.fn()
    setup({ step: { ...step, recurrence_pattern: { type: 'weekly', days: ['mon'] } } as Routine, onScheduleChange })
    // Toggle Mon off — it is the only day, so removing it should call daily
    fireEvent.click(screen.getByRole('button', { name: /^Mon$/i }))
    expect(onScheduleChange).toHaveBeenCalledWith({ type: 'daily' })
  })
})
