import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { RhythmPage } from './RhythmPage'
import type { Routine } from '@/types/actionable'

// Mock hooks pulled in by TapRoutinePanel so tests don't need Supabase auth.
vi.mock('@/hooks/useRoutineStats', () => ({
  useRoutineStats: () => ({ getStats: () => undefined }),
}))
vi.mock('@/hooks/useAttachments', () => ({
  useAttachments: () => ({
    getAttachments: () => [],
    getSignedUrl: vi.fn(),
    fetchAttachments: vi.fn(),
  }),
}))
// The current user's family_member row — RhythmPage asks this for "which pill
// is me" so an unassigned routine you made still shows under your own lens.
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    getCurrentUserMember: () => ({ id: 'me', user_id: 'u1', name: 'Scott', is_full_user: true }),
  }),
}))
// Hide for today writes through the instance writer; its own test covers it.
const { hide } = vi.hoisted(() => ({ hide: { hideForToday: vi.fn(async () => true), showToday: vi.fn(async () => true) } }))
vi.mock('@/components/routine/useHideForToday', () => ({
  useHideForToday: () => hide,
  useSkippedOn: () => false,
}))

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: 'family',
    created_at: '', updated_at: '', ...over,
  }
}

const noop = { onCreateRoutine: vi.fn(), onAddStep: vi.fn(), onReorderSteps: vi.fn(), onPromoteStep: vi.fn() }


const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const todayKey = DAY_KEYS[new Date().getDay()]
/** A day in this same Sunday-start week that isn't today. */
const otherDayKey = DAY_KEYS[(new Date().getDay() + 1) % 7 === 0 ? (new Date().getDay() + 6) % 7 : (new Date().getDay() + 1) % 7]

const MIA = { id: 'mia', user_id: 'u1', name: 'Mia', initials: 'M', color: '#888', avatar_url: null, is_full_user: false, age_range: 'child', display_order: 1, created_at: '' } as never
const LIAM = { id: 'liam', user_id: 'u1', name: 'Liam', initials: 'L', color: '#888', avatar_url: null, is_full_user: false, age_range: 'child', display_order: 2, created_at: '' } as never
const SCOTT = { id: 'me', user_id: 'u1', name: 'Scott', initials: 'S', color: '#888', avatar_url: null, is_full_user: true, age_range: 'adult', display_order: 0, created_at: '' } as never

const bandNames = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

beforeEach(() => {
  localStorage.removeItem('routines-view')
  localStorage.removeItem('routines-arrangement')
  localStorage.removeItem('rhythm-tend-dismissed')
})

describe('RhythmPage — the Board, by time of day (default)', () => {
  const routines = () => [
    mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
    mk('Lunch meds', { id: 'meds', time_of_day: '12:00:00' }),
    mk('Homework', { id: 'hw', time_of_day: '15:30:00', assigned_to: 'mia', recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } }),
    mk('Bedtime', { id: 'bed', time_of_day: '19:30:00', assigned_to_all: ['mia', 'liam'] }),
    mk('Brush teeth', { id: 's1', parent_routine_id: 'bed', step_order: 0 }),
    mk('Lights out', { id: 's2', parent_routine_id: 'bed', step_order: 1 }),
    mk('Water plants', { id: 'water' }),
    mk('Trash night', { id: 'trash', recurrence_pattern: { type: 'weekly', days: ['tue'] } }),
    mk('Pay bills', { id: 'bills', recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
    mk('My journal', { id: 'journal', context: 'personal', assigned_to: 'me', time_of_day: '06:00:00' }),
    mk('Camp mornings', { id: 'camp', visibility: 'reference', paused_until: '2027-06-21T04:00:00.000Z' }),
    mk('Yard weeding', { id: 'yard', show_on_timeline: false }),
  ]

  it('bands the day by time, then Weekly, Monthly & less often, Just mine · private, and Not showing last', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} familyMembers={[SCOTT, MIA, LIAM]} routines={routines()} />)
    expect(screen.getByRole('group', { name: 'Arrange routines' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'By time of day' })).toHaveAttribute('aria-pressed', 'true')
    expect(bandNames()).toEqual([
      'Needs a look · 1',
      'Morning', 'Midday', 'Afternoon', 'Evening', 'Any time of day', 'Weekly', 'Monthly & less often', 'Just mine · private', 'Not showing',
    ])
    const inBand = (band: string, name: string) => within(screen.getByRole('region', { name: band })).getByRole('button', { name })
    expect(inBand('Morning', 'Walk Jax')).toBeInTheDocument()
    expect(inBand('Midday', 'Lunch meds')).toBeInTheDocument()
    expect(inBand('Afternoon', 'Homework')).toBeInTheDocument()
    expect(inBand('Evening', 'Bedtime')).toBeInTheDocument()
    expect(inBand('Weekly', 'Trash night')).toBeInTheDocument()
    expect(inBand('Monthly & less often', 'Pay bills')).toBeInTheDocument()
    expect(inBand('Just mine · private', 'My journal')).toBeInTheDocument()
    // The private one is not also in Morning.
    expect(within(screen.getByRole('region', { name: 'Morning' })).queryByText('My journal')).not.toBeInTheDocument()
    // No legacy rung filler.
    expect(screen.queryByText('Nothing on this rung.')).not.toBeInTheDocument()
  })

  it('a card names the routine once, then people · days · time, where it shows, and its steps', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} familyMembers={[SCOTT, MIA, LIAM]} routines={routines()} />)
    const card = screen.getByRole('button', { name: 'Bedtime' }).closest('li')!
    expect(card.className).toContain('canvas-group')
    expect(within(card).getAllByText('Bedtime')).toHaveLength(1)
    expect(within(card).getByText('Mia, Liam · every day · 7:30 PM')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /^Where Bedtime shows/ })).toHaveTextContent('TodayKioskWeek')
    expect(within(card).getByRole('button', { name: 'Brush teeth' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Lights out' })).toBeInTheDocument()
    const hw = screen.getByRole('button', { name: 'Homework' }).closest('li')!
    expect(within(hw).getByText('Mia · weekdays · 3:30 PM')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Water plants' }).closest('li')!).getByText('every day · any time')).toBeInTheDocument()
  })

  it('Not showing folds Resting (with its wake date) and Off, each opening in place', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} familyMembers={[SCOTT, MIA, LIAM]} routines={routines()} />)
    const notShowing = screen.getByRole('region', { name: 'Not showing' })
    const resting = within(notShowing).getByRole('button', { name: /Resting · 1/ })
    expect(resting).toHaveTextContent('Camp mornings wakes Jun 21, 2027')
    expect(resting).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Yard weeding' })).not.toBeInTheDocument()
    fireEvent.click(within(notShowing).getByRole('button', { name: /Off · 1/ }))
    const yard = screen.getByRole('button', { name: 'Yard weeding' }).closest('li')!
    expect(within(yard).getByRole('button', { name: /^Why isn't Yard weeding showing on Today or Week\?/ })).toBeInTheDocument()
  })

  it('search dims cards that do not match (a step name counts)', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} routines={routines()} />)
    fireEvent.keyDown(window, { key: 'l' })
    fireEvent.keyDown(window, { key: 'i' })
    fireEvent.keyDown(window, { key: 'g' })
    expect(screen.getByRole('button', { name: 'Walk Jax' }).closest('li')!.className).toContain('is-dimmed')
    expect(screen.getByRole('button', { name: 'Bedtime' }).closest('li')!.className).not.toContain('is-dimmed')
  })

  it('the empty account is ONE calm card, no stack of empty bands', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} onBuildWithAI={vi.fn()} routines={[]} />)
    const card = screen.getByRole('region', { name: 'No routines yet' })
    expect(within(card).getByRole('button', { name: 'New routine' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Build with Symphony' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Morning' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Needs a look' })).not.toBeInTheDocument()
  })
})

describe('RhythmPage — other arrangements', () => {
  it('By person: one band per member, Household for shared ones, Unassigned', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} familyMembers={[MIA, LIAM]}
        routines={[
          mk('Piano', { id: 'piano', assigned_to: 'mia', time_of_day: '16:00:00' }),
          mk('Bedtime', { id: 'bed', assigned_to_all: ['mia', 'liam'], time_of_day: '19:30:00' }),
          mk('Water plants', { id: 'water' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'By person' }))
    expect(screen.getByRole('button', { name: 'By person' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('region', { name: 'Mia' })).getByRole('button', { name: 'Piano' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Household' })).getByRole('button', { name: 'Bedtime' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Unassigned' })).getByRole('button', { name: 'Water plants' })).toBeInTheDocument()
    // A member with nothing of their own gets no empty band.
    expect(screen.queryByRole('region', { name: 'Liam' })).not.toBeInTheDocument()
    // The old "Whose week" pills are folded into this arrangement.
    expect(screen.queryByRole('button', { name: 'Everyone' })).not.toBeInTheDocument()
  })

  it('By where it shows: each routine once, under the first surface it shows on', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00', recurrence_pattern: { type: 'weekly', days: [todayKey] } }),
          mk('Swim', { id: 'swim', recurrence_pattern: { type: 'weekly', days: [otherDayKey] } }),
          mk('Someday', { id: 'someday', recurrence_pattern: { type: 'weekly' } }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'By where it shows' }))
    expect(within(screen.getByRole('region', { name: 'Today' })).getByRole('button', { name: 'Walk Jax' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Week' })).getByRole('button', { name: 'Swim' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Nowhere' })).getByRole('button', { name: 'Someday' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Walk Jax' })).toHaveLength(1)
  })

})

describe('RhythmPage — a card\'s ⋯ menu', () => {
  const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Options for ${name}` }))

  it('Off hides it from Today and planning', async () => {
    const onUpdateRoutine = vi.fn(async () => true)
    render(<RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} routines={[mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' })]} />)
    open('Walk Jax')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Off/ }))
    await waitFor(() => expect(onUpdateRoutine).toHaveBeenCalledWith('jax', { show_on_timeline: false }))
  })

  it('Hide for today skips today only', async () => {
    hide.hideForToday.mockClear()
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} routines={[mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' })]} />)
    open('Walk Jax')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Hide for today/ }))
    await waitFor(() => expect(hide.hideForToday).toHaveBeenCalled())
    expect(hide.hideForToday.mock.calls[0][0]).toBe('jax')
  })

  it('Rest until… rests it with a wake date', async () => {
    const onUpdateRoutine = vi.fn(async () => true)
    render(<RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} routines={[mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' })]} />)
    open('Walk Jax')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Rest until…/ }))
    fireEvent.change(screen.getByLabelText('Rest until'), { target: { value: '2027-06-21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rest' }))
    await waitFor(() => expect(onUpdateRoutine).toHaveBeenCalledWith('jax', {
      visibility: 'reference', paused_until: new Date('2027-06-21T00:00:00').toISOString(),
    }))
  })

  it('Delete asks first, then deletes', async () => {
    const onDelete = vi.fn(async () => true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} onDelete={onDelete} routines={[mk('Walk Jax', { id: 'jax' })]} />)
    open('Walk Jax')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('jax'))
    confirm.mockRestore()
  })

  it('Edit opens the routine panel', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} routines={[mk('Walk Jax', { id: 'jax' })]} />)
    open('Walk Jax')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.getByRole('region', { name: 'Where it shows' })).toBeInTheDocument()
  })

  it('dropping one routine card onto another makes it a step there', async () => {
    const onAddToCollection = vi.fn(async () => undefined)
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddToCollection={onAddToCollection}
      routines={[mk('Brush teeth', { id: 'brush', time_of_day: '19:00:00' }), mk('Bedtime', { id: 'bed', time_of_day: '19:30:00' })]} />)
    const target = screen.getByRole('button', { name: 'Bedtime' }).closest('li')!
    fireEvent.drop(target, { dataTransfer: { getData: () => 'brush', types: ['application/x-symphony-routine'] } })
    await waitFor(() => expect(onAddToCollection).toHaveBeenCalledWith('bed', ['brush']))
  })
})

describe('RhythmPage — Needs a look', () => {
  it('look-alikes: Merge into X deletes the others (after asking); They’re different dismisses for good', async () => {
    const onDelete = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { unmount } = render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} onDelete={onDelete}
      routines={[mk('Water plants', { id: 'a' }), mk('Water houseplants', { id: 'b' })]} />)
    const look = screen.getByRole('complementary', { name: 'Needs a look' })
    expect(within(look).getByText(/look like the same job/)).toBeInTheDocument()
    fireEvent.click(within(look).getByRole('button', { name: 'Merge into Water plants' }))
    expect(onDelete).toHaveBeenCalledWith('b')
    confirm.mockRestore()
    unmount()

    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()} routines={[mk('Water plants', { id: 'a' }), mk('Water houseplants', { id: 'b' })]} />)
    fireEvent.click(screen.getByRole('button', { name: 'They’re different' }))
    expect(screen.queryByText(/look like the same job/)).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('rhythm-tend-dismissed')!)).toEqual(['l:a.b'])
  })

  it('a routine with no area is stamped in place', () => {
    const onUpdateRoutine = vi.fn()
    render(<RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} routines={[mk('Water plants', { id: 'x', context: null })]} />)
    const group = screen.getByRole('group', { name: 'Area for Water plants' })
    fireEvent.click(within(group).getByRole('button', { name: 'Family' }))
    expect(onUpdateRoutine).toHaveBeenCalledWith('x', { context: 'family' })
  })

  it('an unfinished name can be renamed in place', () => {
    const onUpdateRoutine = vi.fn()
    render(<RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} routines={[mk('Water the', { id: 'w' })]} />)
    fireEvent.change(screen.getByLabelText('Rename Water the'), { target: { value: 'Water the ferns' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onUpdateRoutine).toHaveBeenCalledWith('w', { name: 'Water the ferns' })
  })

  it('a resting routine with no wake date can be woken from here', async () => {
    const onUpdateRoutine = vi.fn(async () => true)
    render(<RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} routines={[mk('Old thing', { id: 'old', visibility: 'reference' })]} />)
    const look = screen.getByRole('complementary', { name: 'Needs a look' })
    expect(within(look).getByText('“Old thing” is resting with no wake date.')).toBeInTheDocument()
    fireEvent.click(within(look).getByRole('button', { name: 'Wake now' }))
    await waitFor(() => expect(onUpdateRoutine).toHaveBeenCalledWith('old', { visibility: 'active', paused_until: null }))
  })
})

describe('RhythmPage — kept behaviours', () => {
  it('says the domain filter hides routines rather than "No routines yet"', () => {
    const onShowAllDomains = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} routines={[]} hiddenByFilter onShowAllDomains={onShowAllDomains} />
    )
    expect(screen.queryByText('No routines yet')).not.toBeInTheDocument()
    expect(screen.getByText("No routines in the areas you're viewing")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all domains' }))
    expect(onShowAllDomains).toHaveBeenCalled()
  })

  it('type-anywhere search leaves a focused button its own Space and letters', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} routines={[mk('Walk Jax', { id: 'jax' })]} />
    )
    const button = screen.getAllByRole('button')[0]
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    button.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(false)
    fireEvent.keyDown(button, { key: 'j' })
    expect(screen.getByRole('searchbox', { name: 'Find a routine' })).toHaveValue('')
  })

  // Demo run 2026-09-06: the routine panel was taller than the viewport and
  // had no way to scroll to its Delete/Done footer.
  it('caps the routine panel to the viewport and scrolls its body', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Water plants', { id: 'x', time_of_day: '09:00:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Water plants' }))
    const dialog = screen.getByTestId('routine-panel-dialog')
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]')
    expect(dialog.className).toContain('flex-col')
    const body = screen.getByTestId('routine-panel-body')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).toContain('min-h-0')
  })

  it('a step row opens the step panel', () => {
    render(<RhythmPage {...noop} onUpdateRoutine={vi.fn()}
      routines={[mk('Bedtime', { id: 'bed', time_of_day: '19:30:00' }), mk('Brush teeth', { id: 's1', parent_routine_id: 'bed' })]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Brush teeth' }))
    expect(screen.getByText(/inherited from Bedtime/)).toBeInTheDocument()
  })
})


describe('first step on a step-less routine', () => {
  it('Escape closes an open routine panel and keeps the routine', () => {
    const onDelete = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onDelete={onDelete}
        routines={[
          mk('Kids shower routine', { id: 'shower', recurrence_pattern: { type: 'weekly', days: ['tue'] }, time_of_day: '19:00:00' }),
          mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByText('Kids shower routine'))
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  // Walkthrough 2026-09-21, B20: "New routine" used to insert a live row on
  // click, which showed on Today's rungs and in the Planning panel while the
  // editor was still open. Nothing is written until Save now.
  it('"New routine" writes nothing on click, and closing without Save writes nothing', async () => {
    const onCreateCollection = vi.fn()
    const onUpdateRoutine = vi.fn()
    const onDelete = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} onDelete={onDelete}
        onCreateCollection={onCreateCollection}
        routines={[mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' })]} />
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'New routine' })[0])
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
    expect(onCreateCollection).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(onCreateCollection).not.toHaveBeenCalled()
    expect(onUpdateRoutine).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('"New routine" is created once, on Save, with the name typed in the panel', async () => {
    const created = mk('Sunday reset', { id: 'created' })
    const onCreateCollection = vi.fn().mockResolvedValue(created)
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onDelete={vi.fn()}
        onCreateCollection={onCreateCollection}
        routines={[]} />
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'New routine' })[0])
    await screen.findByRole('button', { name: 'Close' })
    // PanelHeader shows the title as a button; click to enter edit mode.
    const titleButtons = screen.getAllByRole('button', { name: 'New routine' })
    fireEvent.click(titleButtons[titleButtons.length - 1])
    const title = screen.getByDisplayValue('New routine')
    fireEvent.change(title, { target: { value: 'Sunday reset' } })
    fireEvent.blur(title)
    expect(onCreateCollection).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument())
    expect(onCreateCollection).toHaveBeenCalledTimes(1)
    expect(onCreateCollection.mock.calls[0][0]).toBe('Sunday reset')
    expect(onCreateCollection.mock.calls[0][1]).toMatchObject({ recurrence_pattern: { type: 'daily' }, visibility: 'active' })
  })

  it('shows the add-step input on a step-less routine panel and adds through it', () => {
    const onAddStep = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddStep={onAddStep} onAddToCollection={vi.fn()}
        routines={[
          mk('Kids shower routine', { id: 'shower', recurrence_pattern: { type: 'weekly', days: ['tue'] }, time_of_day: '19:00:00' }),
          mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByText('Kids shower routine'))
    const input = screen.getByLabelText('Add a step')
    fireEvent.change(input, { target: { value: 'Rinse and brush hair' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAddStep).toHaveBeenCalledWith('shower', 'Rinse and brush hair')
    // step-less routines still offer "Make this a step of" alongside
    expect(screen.getByLabelText(/make this a step of/i)).toBeInTheDocument()
  })
})
