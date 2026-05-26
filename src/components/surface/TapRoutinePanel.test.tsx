import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapRoutinePanel } from './TapRoutinePanel'
import type { Routine } from '@/types/routine'

const routine: Routine = {
  id: 'r1', user_id: 'u1', name: 'Trash night', description: 'Take bins to curb',
  default_assignee: null, assigned_to: null, assigned_to_all: null,
  visibility: 'active', paused_until: null,
  recurrence_pattern: { type: 'weekly', days: ['tue'] },
  time_of_day: '20:00:00', raw_input: null, show_on_timeline: true, context: 'family',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

describe('TapRoutinePanel', () => {
  it('renders the routine name and notes', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByText('Trash night')).toBeInTheDocument()
    expect(screen.getByText('Take bins to curb')).toBeInTheDocument()
  })

  it('reports visibility changes', () => {
    const onVisibilityChange = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={onVisibilityChange} />)
    fireEvent.click(screen.getByRole('button', { name: /reference/i }))
    expect(onVisibilityChange).toHaveBeenCalledWith('reference')
  })
})
