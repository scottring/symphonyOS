import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TapRoutinePanel } from './TapRoutinePanel'
import { CanvasActivityProvider, useCanvasActivity } from '@/contexts/CanvasActivityContext'

/** Tuesday 2026-10-13 / Wednesday 2026-10-14 — fixed so the suite never rots. */
const TUE = new Date(2026, 9, 13)
const WED = new Date(2026, 9, 14)

// Hide for today writes through the instance writer; its own test covers the
// write and Undo. Here we see what the panel asks of it.
const { hide, skippedOn } = vi.hoisted(() => ({
  hide: { hideForToday: vi.fn(async () => true), showToday: vi.fn(async () => true) },
  skippedOn: vi.fn(() => false as boolean | null),
}))
vi.mock('@/components/routine/useHideForToday', () => ({
  useHideForToday: () => hide,
  useSkippedOn: () => skippedOn(),
}))

function UndoButton() {
  const { receipt, undo } = useCanvasActivity()
  return receipt?.undoable ? <button type="button" onClick={() => { void undo() }}>Undo</button> : null
}
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'

// useRoutineStepChecklist fetches today's actionable_instances; mock it so
// render tests stay pure.
vi.mock('@/hooks/useRoutineStepChecklist', () => ({
  useRoutineStepChecklist: () => ({ checkedByStep: new Map(), toggleStep: vi.fn() }),
}))

const drawerProps = vi.fn()
vi.mock('@/components/assist/AssistDrawer', () => ({
  AssistDrawer: (props: Record<string, unknown>) => {
    drawerProps(props)
    return <div data-testid="assist-drawer" />
  },
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
  it('renders the routine name and notes', async () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
    expect(screen.getByText('Trash night')).toBeInTheDocument()
    // Notes mount through a lazy editor boundary — it lands a tick after render.
    expect(await screen.findByText('Take bins to curb')).toBeInTheDocument()
  })

  it('opens with "Where it shows": Today, Week and Kiosk, each with its reason', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} viewedDate={TUE} />)
    const where = screen.getByRole('region', { name: 'Where it shows' })
    expect(within(where).getByText('Today')).toBeInTheDocument()
    expect(within(where).getByText('Week')).toBeInTheDocument()
    expect(within(where).getByText('Kiosk')).toBeInTheDocument()
    expect(within(where).getByText('On Today at 8:00 PM')).toBeInTheDocument()
    expect(within(where).getByText('On the kitchen kiosk at 8:00 PM')).toBeInTheDocument()
  })

  it('explains a day it is not on', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} viewedDate={WED} />)
    const where = screen.getByRole('region', { name: 'Where it shows' })
    expect(within(where).getAllByText('Not on Wednesdays — runs Tue')).toHaveLength(2) // Today and the kiosk
    expect(within(where).getByText('On the week on Tue at 8:00 PM')).toBeInTheDocument()
  })

  it('offers three distinct controls: Hide for today, Rest until…, Off', () => {
    render(
      <TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()} onShowOnTodayChange={vi.fn()} onRestUntilChange={vi.fn()} viewedDate={TUE} />,
    )
    const controls = screen.getByRole('region', { name: 'Hide it' })
    expect(within(controls).getByRole('button', { name: 'Hide for today' })).toBeInTheDocument()
    expect(within(controls).getByText('Rest until…')).toBeInTheDocument()
    expect(within(controls).getByLabelText('Rest until')).toBeInTheDocument()
    expect(within(controls).getByRole('switch', { name: 'Off' })).toHaveAttribute('aria-checked', 'false')
    // Each says how strong it is.
    expect(within(controls).getByText(/Skips today’s occurrence only/)).toBeInTheDocument()
    expect(within(controls).getByText(/Pauses it everywhere/)).toBeInTheDocument()
  })

  it('Hide for today skips the occurrence; it never rests the routine', async () => {
    const onVisibilityChange = vi.fn()
    const onRestUntilChange = vi.fn()
    render(
      <TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()}
        onVisibilityChange={onVisibilityChange} onRestUntilChange={onRestUntilChange} viewedDate={TUE} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide for today' }))
    await waitFor(() => expect(hide.hideForToday).toHaveBeenCalledWith('r1', 'Trash night', TUE))
    expect(onVisibilityChange).not.toHaveBeenCalled()
    expect(onRestUntilChange).not.toHaveBeenCalled()
  })

  it('a skipped occurrence reads as skipped and offers to show it again', () => {
    skippedOn.mockReturnValue(true)
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} viewedDate={TUE} />)
    expect(screen.getByText('Skipped for today only — back next time it’s due')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show today again' }))
    expect(hide.showToday).toHaveBeenCalledWith('r1', 'Trash night', TUE)
    skippedOn.mockReturnValue(false)
  })

  it('Rest until… rests with a wake date, and Undo restores what was there', async () => {
    const onVisibilityChange = vi.fn()
    const onRestUntilChange = vi.fn()
    render(
      <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{} as never} refetch={() => {}}>
        <TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()}
          onVisibilityChange={onVisibilityChange} onRestUntilChange={onRestUntilChange} viewedDate={TUE} />
        <UndoButton />
      </CanvasActivityProvider>,
    )
    fireEvent.change(screen.getByLabelText('Rest until'), { target: { value: '2027-06-21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rest until Jun 21, 2027' }))
    await waitFor(() => expect(onRestUntilChange).toHaveBeenCalled())
    expect(onVisibilityChange).toHaveBeenCalledWith('reference')
    expect(onRestUntilChange.mock.calls[0][0]).toBe(new Date('2027-06-21T00:00:00').toISOString())
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(onVisibilityChange).toHaveBeenLastCalledWith('active'))
    expect(onRestUntilChange).toHaveBeenLastCalledWith(null)
  })

  it('a resting routine says when it wakes and offers Wake now', async () => {
    const onVisibilityChange = vi.fn()
    render(<TapRoutinePanel routine={{ ...routine, visibility: 'reference', paused_until: '2027-06-21T04:00:00.000Z' }} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={onVisibilityChange} viewedDate={TUE} />)
    expect(screen.getByText(/Asleep everywhere until Jun 21, 2027/)).toBeInTheDocument()
    expect(screen.getAllByText('Resting until Jun 21, 2027 — it wakes on its own').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Hide for today' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wake now' }))
    await waitFor(() => expect(onVisibilityChange).toHaveBeenCalledWith('active'))
  })

  // Scott, 2026-09-07: "make it so you can choose not to show particular
  // routines on the Today page." Separate from Rest: Off keeps the routine
  // running (and on the kitchen wall), it just stops the row.
  it('Off is a switch, and reports hiding from Today and planning', async () => {
    const onShowOnTodayChange = vi.fn()
    render(
      <TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()} onShowOnTodayChange={onShowOnTodayChange} />,
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Off' }))
    await waitFor(() => expect(onShowOnTodayChange).toHaveBeenCalledWith(false))
  })

  it('says what an Off routine still does', () => {
    render(
      <TapRoutinePanel routine={{ ...routine, show_on_timeline: false }} onClose={vi.fn()} onNotesChange={vi.fn()}
        onContextChange={vi.fn()} onVisibilityChange={vi.fn()} onShowOnTodayChange={vi.fn()} viewedDate={TUE} />,
    )
    expect(screen.getByRole('switch', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/Still runs, and still on the kitchen kiosk/)).toBeInTheDocument()
    expect(screen.getAllByText('Hidden from Today and planning (Off)')).toHaveLength(2) // Today and the week
    expect(screen.getByText('Still on the kitchen kiosk — Off only clears Today and planning')).toBeInTheDocument()
  })

  it('a Personal routine is never on the shared kiosk', () => {
    render(<TapRoutinePanel routine={{ ...routine, context: 'personal', assigned_to: 'iris' }} familyMembers={[{ ...members[0], is_full_user: true }]} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} viewedDate={TUE} />)
    expect(screen.getByText('Private to Iris — never on the shared kiosk')).toBeInTheDocument()
  })

  it('explains live while the schedule is being edited', () => {
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} onScheduleChange={vi.fn()} viewedDate={WED} />)
    expect(screen.getAllByText('Not on Wednesdays — runs Tue').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Edit schedule/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }))
    expect(screen.getByText('On Today at 8:00 PM')).toBeInTheDocument()
  })

  it('On Today says what it will actually do: at its time, on its day, or offered to choose', () => {
    const say = (r: Routine) => {
      const { unmount } = render(<TapRoutinePanel routine={r} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} onShowOnTodayChange={vi.fn()} />)
      const text = document.body.textContent ?? ''
      unmount()
      return text
    }
    expect(say(routine)).toMatch(/at its time/)
    const onDays = /On Today and the week on each day it’s due — no time needed/
    expect(say({ ...routine, time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sun'] } })).toMatch(onDays)
    expect(say({ ...routine, time_of_day: null, recurrence_pattern: { type: 'daily' } })).toMatch(onDays)
    expect(say({ ...routine, time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['tue', 'thu'] } })).toMatch(onDays)
    expect(say({ ...routine, time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] } })).toMatch(onDays)
    expect(say({ ...routine, time_of_day: null, recurrence_pattern: { type: 'weekend' } })).toMatch(/Offered on Today to choose/)
    expect(say({ ...routine, time_of_day: null, recurrence_pattern: { type: 'daily' } })).not.toMatch(/no set day/)
  })

  it('offers no Off switch while the routine is resting off everything', () => {
    render(
      <TapRoutinePanel routine={{ ...routine, visibility: 'reference' }} onClose={vi.fn()} onNotesChange={vi.fn()}
        onContextChange={vi.fn()} onVisibilityChange={vi.fn()} onShowOnTodayChange={vi.fn()} />,
    )
    expect(screen.queryByRole('switch', { name: 'Off' })).not.toBeInTheDocument()
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
    expect(onScheduleChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save repeating schedule' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Save repeating schedule' }))
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

  it('moves the routine into a chosen collection via "Make this a step of"', () => {
    const onMoveInto = vi.fn()
    render(<TapRoutinePanel routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()}
      onVisibilityChange={vi.fn()} onMoveInto={onMoveInto}
      moveTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    fireEvent.change(screen.getByLabelText(/make this a step of/i), { target: { value: 'bed' } })
    expect(onMoveInto).toHaveBeenCalledWith('bed')
  })

  // RhythmPage passes steps/onSelectStep/onAddStep/onReorderSteps UNCONDITIONALLY —
  // standalone routines arrive as `{ ...r, steps: [] }` (the "add first step"
  // affordance is always visible there). A zero-step routine is still the atom, so
  // Target must render in that exact shape.
  it('renders the Target section when steps is an empty array (RhythmPage-shaped standalone routine)', () => {
    render(
      <TapRoutinePanel
        routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()}
        steps={[]} onSelectStep={vi.fn()} onAddStep={vi.fn()} onReorderSteps={vi.fn()}
        onTargetChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /add a daily target/i })).toBeInTheDocument()
  })

  it('does NOT render the Target section once the routine has real steps', () => {
    const steps = [{ ...routine, id: 'st1', name: 'Chin tuck', parent_routine_id: routine.id } as Routine]
    render(
      <TapRoutinePanel
        routine={routine} onClose={vi.fn()} onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()}
        steps={steps} onSelectStep={vi.fn()} onAddStep={vi.fn()} onReorderSteps={vi.fn()}
        onTargetChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /add a daily target/i })).not.toBeInTheDocument()
  })
})

describe('TapRoutinePanel Discuss action', () => {
  it('labels the action Discussion and hands the drawer the routine own scope', () => {
    const shared = { ...routine, scope: 'compound' as const }
    render(
      <TapRoutinePanel
        routine={shared}
        onClose={vi.fn()}
        onNotesChange={vi.fn()}
        onContextChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        onAssistMutate={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Discussion' })
    expect(screen.queryByRole('button', { name: 'Help me plan' })).toBeNull()
    fireEvent.click(button)
    expect(drawerProps).toHaveBeenCalledWith(expect.objectContaining({
      discuss: { type: 'routine', id: 'r1', title: 'Trash night', scope: 'compound' },
    }))
  })
})

it('keeps a failed schedule edit open and retries the same time before closing', async () => {
  const close = vi.fn(), save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { waitFor } = await import('@testing-library/react')
  render(<TapRoutinePanel routine={{ ...routine, time_of_day: null }} onClose={close} onScheduleChange={save}
    onNotesChange={vi.fn()} onContextChange={vi.fn()} onVisibilityChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Edit schedule/i }))
  const input = document.querySelector('input[type="time"]')!
  fireEvent.change(input, { target: { value: '20:30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save & close' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save'))
  expect(close).not.toHaveBeenCalled()
  expect(input).toHaveValue('20:30')
  fireEvent.click(screen.getByRole('button', { name: 'Save & close' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenLastCalledWith(routine.recurrence_pattern, '20:30')
})
