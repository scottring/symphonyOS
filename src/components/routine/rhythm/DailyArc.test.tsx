import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DailyArc } from './DailyArc'
import { arcColumns } from './dragTypes'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

function mkDT(): DataTransfer {
  const dt = new DataTransfer()
  return dt
}

const base = {
  familyMembers: [],
  matches: () => true,
  nowMinutes: 12 * 60,
  onOpenCollection: vi.fn(),
  onOpenRoutine: vi.fn(),
}

describe('DailyArc slot add', () => {
  const card: RhythmCard = {
    kind: 'single', id: 'walk', name: 'Walk Jax',
    startTime: '06:30:00', endTime: '06:30:00',
    routines: [mk({ name: 'Walk Jax', time_of_day: '06:30:00' })],
  }

  it('creates a daily routine at the point on the ruler you clicked', () => {
    const onCreateInSlot = vi.fn()
    render(<DailyArc {...base} cards={[card]} anytime={[]} onCreateInSlot={onCreateInSlot} />)

    fireEvent.click(screen.getByTestId('arc-axis'), { clientX: 0 })
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'Pack lunches' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(onCreateInSlot).toHaveBeenCalledWith({
      name: 'Pack lunches',
      recurrence_pattern: { type: 'daily' },
      // jsdom reports a zero-width rect, so the mapping floors to the arc start.
      time_of_day: '06:00',
    })
  })

  it('creates an untimed daily routine from the anytime row', () => {
    const onCreateInSlot = vi.fn()
    render(
      <DailyArc {...base} cards={[card]} anytime={[mk({ name: 'Read' })]}
                onCreateInSlot={onCreateInSlot} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add a routine with no set time' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tidy the porch' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(onCreateInSlot).toHaveBeenCalledWith({
      name: 'Tidy the porch',
      recurrence_pattern: { type: 'daily' },
    })
  })
})

describe('DailyArc', () => {
  it('renders cluster cards with time range and members', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '06:30:00', endTime: '07:00:00', suggestedName: 'Morning',
      routines: [mk({ name: 'Walk Jax', time_of_day: '06:30:00' }), mk({ name: 'Feed Jax', time_of_day: '07:00:00' })],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    expect(screen.getByText('Walk Jax')).toBeInTheDocument()
    expect(screen.getByText('6:30 – 7')).toBeInTheDocument()
  })

  it('renders auto-group titles as plain text when no naming props are given', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    expect(screen.getByText('Bedtime').closest('button')).toBeNull()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('styles auto-groups exactly like named cards (no dashed amber border)', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    const el = screen.getByTestId('arc-card-c1')
    expect(el.className).not.toContain('border-dashed')
    expect(el.className).toContain('border-neutral-100')
  })

  it('opens the collection panel from a collection card title', () => {
    const onOpenCollection = vi.fn()
    const parent = mk({ id: 'coll', name: 'Camp Mornings' })
    const card: RhythmCard = {
      kind: 'collection', id: 'coll', name: 'Camp Mornings',
      startTime: '07:00:00', endTime: '07:00:00',
      routines: [mk({ name: 'Eat breakfast' })], routine: parent,
    }
    render(<DailyArc {...base} onOpenCollection={onOpenCollection} cards={[card]} anytime={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Camp Mornings' }))
    expect(onOpenCollection).toHaveBeenCalledWith('coll')
  })

  it('renders anytime pills and opens the routine on click — no quick-add', () => {
    const onOpenRoutine = vi.fn()
    const pt = mk({ name: 'PT Exercises' })
    render(<DailyArc {...base} onOpenRoutine={onOpenRoutine} cards={[]} anytime={[pt]} />)
    fireEvent.click(screen.getByText('PT Exercises'))
    expect(onOpenRoutine).toHaveBeenCalledWith(pt)
    expect(screen.queryByLabelText(/add an every-day routine/i)).not.toBeInTheDocument()
  })

  it('dims non-matching routines when searching', () => {
    const card: RhythmCard = {
      kind: 'single', id: 'a', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'a', name: 'Walk Jax' })],
    }
    render(<DailyArc {...base} matches={() => false} cards={[card]} anytime={[]} />)
    expect(screen.getByTestId('arc-card-a').className).toContain('opacity-30')
  })

  const dragProps = { onDropIntent: vi.fn(), foldTargets: [], onNameGroup: vi.fn(), onFoldInto: vi.fn() }

  it('sets a routine payload when dragging a cluster pill', () => {
    const dt = mkDT()
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null, startTime: '06:30:00', endTime: '07:00:00',
      suggestedName: 'Morning', routines: [mk({ id: 'walk', name: 'Walk Jax', time_of_day: '06:30:00' }), mk({ id: 'feed', name: 'Feed Jax' })],
    }
    render(<DailyArc {...base} {...dragProps} cards={[card]} anytime={[]} />)
    fireEvent.dragStart(screen.getByText('Walk Jax').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'routine', id: 'walk' })
  })

  it('sets a step payload when dragging a collection step pill', () => {
    const dt = mkDT()
    const parent = mk({ id: 'camp', name: 'Camp Mornings' })
    const card: RhythmCard = {
      kind: 'collection', id: 'camp', name: 'Camp Mornings', startTime: '07:00:00', endTime: '07:00:00',
      routines: [mk({ id: 'pack', name: 'Pack bags', parent_routine_id: 'camp' })], routine: parent,
    }
    render(<DailyArc {...base} {...dragProps} cards={[card]} anytime={[]} />)
    fireEvent.dragStart(screen.getByText('Pack bags').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'step', id: 'pack' })
  })

  it('dropping a pill on a collection block emits add-steps', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'hamper' }))
    dt.setData('text/rhythm-kind-routine', '1')
    const parent = mk({ id: 'bed', name: 'Kids Bedtime' })
    const card: RhythmCard = {
      kind: 'collection', id: 'bed', name: 'Kids Bedtime', startTime: '19:15:00', endTime: '19:15:00',
      routines: [mk({ id: 'read', name: 'Read', parent_routine_id: 'bed' })], routine: parent,
    }
    render(<DailyArc {...base} {...dragProps} onDropIntent={onDropIntent} cards={[card]} anytime={[]} />)
    fireEvent.drop(screen.getByTestId('arc-card-bed'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'add-steps', collectionId: 'bed', ids: ['hamper'] })
  })

  it('dropping a step on the axis emits stand-alone-at (jsdom time guard → 06:00)', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'step', id: 'pack' }))
    dt.setData('text/rhythm-kind-step', '1')
    const card: RhythmCard = {
      kind: 'single', id: 'walk', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'walk', name: 'Walk Jax', time_of_day: '06:30:00' })],
    }
    render(<DailyArc {...base} {...dragProps} onDropIntent={onDropIntent} cards={[card]} anytime={[]} />)
    fireEvent.drop(screen.getByTestId('arc-axis'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'stand-alone-at', id: 'pack', time: '06:00' })
  })

  it('tapping an auto-group title opens the naming popover and names through', () => {
    const onNameGroup = vi.fn()
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null, startTime: '19:00:00', endTime: '19:06:00',
      suggestedName: 'Bedtime', routines: [mk({ id: 'a' }), mk({ id: 'b' })],
    }
    render(<DailyArc {...base} {...dragProps} onNameGroup={onNameGroup} cards={[card]} anytime={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /bedtime/i }))
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Evening reset' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNameGroup).toHaveBeenCalledWith(card, 'Evening reset')
  })

  it('clicking the group title a second time closes the popover', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null, startTime: '19:00:00', endTime: '19:06:00',
      suggestedName: 'Bedtime', routines: [mk({ id: 'a' }), mk({ id: 'b' })],
    }
    render(<DailyArc {...base} {...dragProps} cards={[card]} anytime={[]} />)
    const title = screen.getByRole('button', { name: /bedtime/i })
    fireEvent.mouseDown(title); fireEvent.click(title)
    expect(screen.getByPlaceholderText('Name this rhythm')).toBeInTheDocument()
    fireEvent.mouseDown(title); fireEvent.click(title)
    expect(screen.queryByPlaceholderText('Name this rhythm')).not.toBeInTheDocument()
  })

  it('anytime pills are draggable with a routine payload', () => {
    const dt = mkDT()
    const pt = mk({ id: 'pt', name: 'PT Exercises' })
    render(<DailyArc {...base} {...dragProps} cards={[]} anytime={[pt]} />)
    fireEvent.dragStart(screen.getByText('PT Exercises').closest('[draggable="true"]')!, { dataTransfer: dt })
    expect(JSON.parse(dt.getData('text/rhythm-payload'))).toEqual({ kind: 'routine', id: 'pt' })
  })
})

describe('arcColumns', () => {
  const c = (id: string, startTime: string | null): RhythmCard =>
    ({ kind: 'single', id, name: id, startTime, endTime: startTime, routines: [] })

  it('places cards proportionally to their start time', () => {
    const cols = arcColumns([c('morning', '06:30:00'), c('noonish', '13:45:00'), c('evening', '21:00:00')])
    expect(cols[0]).toBe(1)      // 6:30 → far left
    expect(cols[1]).toBe(7)      // ~midday → middle band
    expect(cols[2]).toBe(13)     // 21:00 → far right (16 - 4 + 1 = max 13)
  })

  it('pushes same-row collisions right and clamps to the grid', () => {
    // cards 0 and 2 share the top row; identical times must not overlap
    const cols = arcColumns([c('a', '07:00:00'), c('b', '07:05:00'), c('c', '07:10:00')])
    expect(cols[2]).toBeGreaterThanOrEqual(cols[0] + 4)
    const clamped = arcColumns([c('x', '21:30:00'), c('y', '21:30:00'), c('z', '21:30:00')])
    expect(Math.max(...clamped)).toBeLessThanOrEqual(13)
  })
})

describe('routine-on-routine grouping', () => {
  const dragProps = { onDropIntent: vi.fn(), foldTargets: [], onNameGroup: vi.fn(), onFoldInto: vi.fn() }

  it('dropping onto a single block emits add-steps targeting that routine', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'feed' }))
    dt.setData('text/rhythm-kind-routine', '1')
    const card: RhythmCard = {
      kind: 'single', id: 'walk', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'walk', name: 'Walk Jax', time_of_day: '06:30:00' })],
    }
    render(<DailyArc {...base} {...dragProps} onDropIntent={onDropIntent} cards={[card]} anytime={[]} />)
    fireEvent.drop(screen.getByTestId('arc-card-walk'), { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'add-steps', collectionId: 'walk', ids: ['feed'] })
  })

  it('dropping onto a cluster pill emits add-steps targeting that pill', () => {
    const onDropIntent = vi.fn()
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'hamper' }))
    dt.setData('text/rhythm-kind-routine', '1')
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null, startTime: '19:00:00', endTime: '19:06:00',
      suggestedName: 'Bedtime',
      routines: [mk({ id: 'kitchen', name: 'Clean kitchen', time_of_day: '19:00:00' }), mk({ id: 'dog', name: 'Feed dog' })],
    }
    render(<DailyArc {...base} {...dragProps} onDropIntent={onDropIntent} cards={[card]} anytime={[]} />)
    fireEvent.drop(screen.getByText('Clean kitchen').closest('button')!, { dataTransfer: dt })
    expect(onDropIntent).toHaveBeenCalledWith({ type: 'add-steps', collectionId: 'kitchen', ids: ['hamper'] })
  })

  it('uses a focused heading when provided', () => {
    const card: RhythmCard = {
      kind: 'single', id: 'walk', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'walk', name: 'Walk Jax' })],
    }
    render(<DailyArc {...base} heading="Wednesday — the whole day" cards={[card]} anytime={[]} />)
    expect(screen.getByText('Wednesday — the whole day')).toBeInTheDocument()
    expect(screen.queryByText('Every day')).not.toBeInTheDocument()
  })
})
