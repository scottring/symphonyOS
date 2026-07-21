import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SometimesShelf } from './SometimesShelf'
import { SeasonalShelf } from './SeasonalShelf'
import { TendCard } from './TendCard'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'monthly', day_of_month: 1 },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

describe('SometimesShelf', () => {
  it('renders frequency captions and hides when empty', () => {
    const { container } = render(
      <SometimesShelf matches={() => true} onOpenRoutine={vi.fn()}
        routines={[mk('Pay FFG'), mk('Haircut', { recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' } })]} />
    )
    expect(screen.getByText(/monthly/)).toBeInTheDocument()
    expect(screen.getByText(/every 6 weeks/)).toBeInTheDocument()
    const { container: emptyC } = render(
      <SometimesShelf matches={() => true} onOpenRoutine={vi.fn()} routines={[]} />
    )
    expect(emptyC.firstChild).toBeNull()
    expect(container.firstChild).not.toBeNull()
  })
})

describe('SeasonalShelf', () => {
  it('titles by earliest paused_until month and wakes all', () => {
    const onWakeAll = vi.fn()
    render(
      <SeasonalShelf onWakeAll={onWakeAll} onOpenRoutine={vi.fn()}
        routines={[
          mk('Walk to school', { visibility: 'reference', paused_until: '2026-09-01T00:00:00Z' }),
          mk('FFG pickup', { visibility: 'reference', paused_until: '2026-10-01T00:00:00Z' }),
        ]} />
    )
    expect(screen.getByText(/Waiting for September/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onWakeAll).toHaveBeenCalledOnce()
  })

  it('says Resting when no paused_until dates', () => {
    render(
      <SeasonalShelf onWakeAll={vi.fn()} onOpenRoutine={vi.fn()}
        routines={[mk('Old thing', { visibility: 'reference' })]} />
    )
    expect(screen.getByText(/Resting/)).toBeInTheDocument()
  })

  it('expand shows per-routine buttons, clicking one calls onOpenRoutine', () => {
    const onOpenRoutine = vi.fn()
    const r1 = mk('Walk to school', { id: 'r1', visibility: 'reference', paused_until: '2026-09-01T00:00:00Z' })
    const r2 = mk('FFG pickup', { id: 'r2', visibility: 'reference', paused_until: '2026-09-01T00:00:00Z' })
    render(
      <SeasonalShelf onWakeAll={vi.fn()} onOpenRoutine={onOpenRoutine} routines={[r1, r2]} />
    )
    // Click title toggle to expand
    fireEvent.click(screen.getByRole('button', { name: /waiting for/i }))
    expect(screen.getByRole('button', { name: /walk to school/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ffg pickup/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /walk to school/i }))
    expect(onOpenRoutine).toHaveBeenCalledWith(r1)
  })
})

describe('TendCard', () => {
  it('merge flow: pick survivor, confirm fires onMerge with losers', () => {
    const onMerge = vi.fn()
    const a = mk('Water plants', { id: 'a' })
    const b = mk('Water houseplants', { id: 'b' })
    render(
      <TendCard routines={[a, b]} onMerge={onMerge} onStampDomain={vi.fn()} onRename={vi.fn()} onLetGo={vi.fn()}
        findings={[{ kind: 'lookalike', ids: ['a', 'b'], names: ['Water plants', 'Water houseplants'] }]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /merge/i }))
    fireEvent.click(screen.getByLabelText('Water plants'))
    fireEvent.click(screen.getByRole('button', { name: /keep this one/i }))
    expect(onMerge).toHaveBeenCalledWith('a', ['b'])
  })

  it('stamping strip advances through missing-domain ids', () => {
    const onStampDomain = vi.fn()
    const a = mk('laundry', { id: 'a', context: null })
    const b = mk('dishes', { id: 'b', context: null })
    render(
      <TendCard routines={[a, b]} onMerge={vi.fn()} onStampDomain={onStampDomain} onRename={vi.fn()} onLetGo={vi.fn()}
        findings={[{ kind: 'missing-domain', ids: ['a', 'b'] }]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /review/i }))
    expect(screen.getByText('laundry')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /family/i }))
    expect(onStampDomain).toHaveBeenCalledWith('a', 'family')
    expect(screen.getByText('dishes')).toBeInTheDocument()
  })

  it('renders nothing when no findings', () => {
    const { container } = render(
      <TendCard routines={[]} findings={[]} onMerge={vi.fn()} onStampDomain={vi.fn()} onRename={vi.fn()} onLetGo={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('unfinished-name: rename on Enter, let-go needs two clicks', () => {
    const onRename = vi.fn()
    const onLetGo = vi.fn()
    const { rerender } = render(
      <TendCard routines={[]} findings={[{ kind: 'unfinished-name', id: 'a', name: 'Do laundry in the' }]}
        onMerge={vi.fn()} onStampDomain={vi.fn()} onRename={onRename} onLetGo={onLetGo} />
    )
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Do laundry' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('a', 'Do laundry')

    // Re-render with same finding to test let-go behavior
    rerender(
      <TendCard routines={[]} findings={[{ kind: 'unfinished-name', id: 'a', name: 'Do laundry in the' }]}
        onMerge={vi.fn()} onStampDomain={vi.fn()} onRename={vi.fn()} onLetGo={onLetGo} />
    )
    const letGoButton = screen.getByRole('button', { name: /let go/i })
    fireEvent.click(letGoButton)
    expect(onLetGo).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /sure\? remove/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /sure\? remove/i }))
    expect(onLetGo).toHaveBeenCalledWith('a')
  })

  it('caps display at 3 findings but shows total in badge', () => {
    const onMerge = vi.fn()
    render(
      <TendCard routines={[]}
        findings={[
          { kind: 'unfinished-name', id: 'a', name: 'Do laundry in the' },
          { kind: 'unfinished-name', id: 'b', name: 'Partial task B' },
          { kind: 'unfinished-name', id: 'c', name: 'Partial task C' },
          { kind: 'unfinished-name', id: 'd', name: 'Partial task D' },
        ]}
        onMerge={onMerge} onStampDomain={vi.fn()} onRename={vi.fn()} onLetGo={vi.fn()} />
    )
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.getByText(/4 suggestions/)).toBeInTheDocument()
  })
})
