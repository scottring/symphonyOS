import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RoutinesListRedesign } from './RoutinesListRedesign'
import type { Routine } from '@/types/actionable'

function r(id: string, name: string, extra: Partial<Routine> = {}): Routine {
  return {
    id, user_id: 'u1', name, recurrence_pattern: { type: 'daily' }, visibility: 'active',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...extra,
  } as Routine
}

const routines: Routine[] = [
  r('c1', 'Shoulder HEP'),
  r('s1', 'Chin tuck', { parent_routine_id: 'c1', step_order: 0 }),
  r('s2', 'Nerve glide', { parent_routine_id: 'c1', step_order: 1 }),
  r('flat', 'Trash night'),
]

function setup(overrides = {}) {
  const props = {
    routines, onSelectRoutine: vi.fn(), onCreateRoutine: vi.fn(), onUpdateRoutine: vi.fn(),
    onAddStep: vi.fn(), onReorderSteps: vi.fn(), onPromoteStep: vi.fn(), ...overrides,
  }
  render(<RoutinesListRedesign {...props} />)
  return props
}

describe('RoutinesListRedesign two-level', () => {
  it('renders a collection row and the standalone routine', () => {
    setup()
    expect(screen.getByText('Shoulder HEP')).toBeInTheDocument()
    expect(screen.getByText('Trash night')).toBeInTheDocument()
  })

  it('marks the collection with its step count', () => {
    setup()
    expect(screen.getByText(/2 steps/i)).toBeInTheDocument()
  })

  it('clicking a standalone routine uses the existing onSelectRoutine path', () => {
    const { onSelectRoutine } = setup()
    fireEvent.click(screen.getByText('Trash night'))
    expect(onSelectRoutine).toHaveBeenCalledWith(expect.objectContaining({ id: 'flat' }))
  })

  it('group mode: selecting two standalone routines and grouping reports their ids', () => {
    const onGroupIntoCollection = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue('Morning')
    // Two standalone routines so we can select both
    const rs = [r('a', 'Make bed'), r('b', 'Brush teeth')]
    render(<RoutinesListRedesign
      routines={rs} onSelectRoutine={vi.fn()} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
      onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
      onCreateCollection={vi.fn()} onGroupIntoCollection={onGroupIntoCollection} />)
    fireEvent.click(screen.getByRole('button', { name: /^select$/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select make bed/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select brush teeth/i }))
    fireEvent.click(screen.getByRole('button', { name: /group into routine/i }))
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Morning', expect.arrayContaining(['a', 'b']))
  })
})
