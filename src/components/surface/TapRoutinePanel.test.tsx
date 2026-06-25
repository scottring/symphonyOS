import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapRoutinePanel } from './TapRoutinePanel'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'

// The panel reads streaks via useRoutineStats (which needs auth/supabase).
// Mock it so this is a pure render test.
vi.mock('@/hooks/useRoutineStats', () => ({
  useRoutineStats: () => ({ getStats: () => ({ currentStreak: 5 }), loading: false, stats: new Map(), refetch: vi.fn() }),
}))

// useAttachments needs auth/supabase; mock it out for render-only tests.
vi.mock('@/hooks/useAttachments', () => ({
  useAttachments: () => ({
    attachments: new Map(),
    isLoading: false,
    error: null,
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    fetchAttachments: vi.fn().mockResolvedValue([]),
    getAttachments: vi.fn().mockReturnValue([]),
    getSignedUrl: vi.fn().mockResolvedValue(null),
  }),
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

  it('renders visibility as a labelled on/off switch (checked when active)', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    const sw = screen.getByRole('switch', { name: /show on today's timeline/i })
    expect(sw).toBeInTheDocument()
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/appears on Today at its scheduled time/i)).toBeInTheDocument()
  })

  it('toggling the switch off reports a reference visibility change', () => {
    const onVisibilityChange = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={onVisibilityChange} />)
    fireEvent.click(screen.getByRole('switch', { name: /show on today's timeline/i }))
    expect(onVisibilityChange).toHaveBeenCalledWith('reference')
  })

  it('shows the streak when present', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByText('5-day streak')).toBeInTheDocument()
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

  it('renames the routine via the header (onRename gets the new name)', () => {
    const onRename = vi.fn()
    render(
      <TapRoutinePanel
        routine={routine}
        onClose={vi.fn()}
        onRename={onRename}
        onNotesChange={vi.fn()}
        onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()}
      />,
    )
    // PanelHeader shows the title as a button; click to enter edit mode.
    fireEvent.click(screen.getByRole('button', { name: 'Trash night' }))
    const input = screen.getByDisplayValue('Trash night')
    fireEvent.change(input, { target: { value: 'Recycling night' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('Recycling night')
  })

  it('edits the schedule: changing the day reports a new recurrence pattern', () => {
    const onScheduleChange = vi.fn()
    render(
      <TapRoutinePanel
        routine={routine}
        onClose={vi.fn()}
        onNotesChange={vi.fn()}
        onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        onScheduleChange={onScheduleChange}
      />,
    )
    // Collapsed by default — expand the schedule editor.
    fireEvent.click(screen.getByRole('button', { name: /Edit schedule/i }))
    // Routine repeats Tue; toggling Mon on should report days including 'mon'.
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }))
    expect(onScheduleChange).toHaveBeenCalledTimes(1)
    const [pattern, time] = onScheduleChange.mock.calls[0]
    expect(pattern.type).toBe('weekly')
    expect(pattern.days).toEqual(expect.arrayContaining(['tue', 'mon']))
    // Time of day preserved as HH:MM.
    expect(time).toBe('20:00')
  })

  it('edits the schedule: changing the time reports the new time of day', () => {
    const onScheduleChange = vi.fn()
    render(
      <TapRoutinePanel
        routine={routine}
        onClose={vi.fn()}
        onNotesChange={vi.fn()}
        onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        onScheduleChange={onScheduleChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Edit schedule/i }))
    const timeInput = screen.getByDisplayValue('20:00')
    fireEvent.change(timeInput, { target: { value: '07:30' } })
    expect(onScheduleChange).toHaveBeenCalled()
    const lastCall = onScheduleChange.mock.calls[onScheduleChange.mock.calls.length - 1]
    expect(lastCall[1]).toBe('07:30')
  })

  it('renders a Steps section when step handlers + steps are provided', () => {
    const steps = [{ ...routine, id: 'st1', name: 'Chin tuck', parent_routine_id: routine.id } as Routine]
    render(
      <TapRoutinePanel
        routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()}
        steps={steps} onSelectStep={vi.fn()} onAddStep={vi.fn()} onReorderSteps={vi.fn()}
      />,
    )
    expect(screen.getByText('Chin tuck')).toBeInTheDocument()
    expect(screen.getByLabelText(/add a step/i)).toBeInTheDocument()
  })

  it('does NOT render a Steps section when step handlers are absent (Today-tap parity)', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.queryByLabelText(/add a step/i)).not.toBeInTheDocument()
  })
})
