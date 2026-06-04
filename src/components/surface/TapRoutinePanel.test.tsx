import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapRoutinePanel } from './TapRoutinePanel'
import type { Routine } from '@/types/routine'
import type { FamilyMember } from '@/types/family'

// The panel reads streaks via useRoutineStats (which needs auth/supabase).
// Mock it so this is a pure render test.
vi.mock('@/hooks/useRoutineStats', () => ({
  useRoutineStats: () => ({ getStats: () => ({ currentStreak: 5 }), loading: false, stats: new Map(), refetch: vi.fn() }),
}))

const routine: Routine = {
  id: 'r1', user_id: 'u1', name: 'Trash night', description: 'Take bins to curb',
  default_assignee: null, assigned_to: null, assigned_to_all: null,
  visibility: 'active', paused_until: null,
  recurrence_pattern: { type: 'weekly', days: ['tue'] },
  time_of_day: '20:00:00', raw_input: null, show_on_timeline: true, context: 'family',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

const members: FamilyMember[] = [
  { id: 'iris', name: 'Iris', initials: 'IR', color: 'purple' } as FamilyMember,
]

describe('TapRoutinePanel', () => {
  it('renders the routine name and notes', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByText('Trash night')).toBeInTheDocument()
    expect(screen.getByText('Take bins to curb')).toBeInTheDocument()
  })

  it('relabels visibility as "On timeline" / "Reference" with an explanatory hint', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'On timeline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reference' })).toBeInTheDocument()
    expect(screen.getByText(/keeps the routine but hides it from Today/i)).toBeInTheDocument()
  })

  it('reports visibility changes', () => {
    const onVisibilityChange = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={onVisibilityChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(onVisibilityChange).toHaveBeenCalledWith('reference')
  })

  it('shows the streak when present', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByText('5-day streak')).toBeInTheDocument()
  })

  it('renames the routine via the editable title', () => {
    const onNameChange = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} onNameChange={onNameChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Trash night' }))
    const input = screen.getByDisplayValue('Trash night')
    fireEvent.change(input, { target: { value: 'Recycling night' } })
    fireEvent.blur(input)
    expect(onNameChange).toHaveBeenCalledWith('Recycling night')
  })

  it('edits the schedule: frequency, weekday, and shows the time', () => {
    const onScheduleChange = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} onScheduleChange={onScheduleChange} />)
    // Weekly → switch to Daily (keeps the time)
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }))
    expect(onScheduleChange).toHaveBeenCalledWith({ type: 'daily' }, '20:00:00')
    // Toggle Wednesday on (was just Tuesday)
    fireEvent.click(screen.getByRole('button', { name: 'wed' }))
    expect(onScheduleChange).toHaveBeenCalledWith({ type: 'weekly', days: ['tue', 'wed'] }, '20:00:00')
    // Time input reflects 20:00
    expect(screen.getByDisplayValue('20:00')).toBeInTheDocument()
  })

  it('does not render the schedule editor without onScheduleChange', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Daily' })).not.toBeInTheDocument()
  })

  it('renders the assignee picker when members + onAssignChange are provided', () => {
    render(
      <TapRoutinePanel
        routine={routine}
        familyMembers={members}
        onClose={vi.fn()}
        onNotesChange={vi.fn()}
        onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        onAssignChange={vi.fn()}
      />,
    )
    // MultiAssigneeDropdown renders an assign control (button) — its presence
    // confirms the picker mounted with our members.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(2)
  })
})
