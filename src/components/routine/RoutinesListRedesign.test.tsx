import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RoutinesListRedesign } from './RoutinesListRedesign'
import type { Routine } from '@/types/actionable'

// Mock hooks pulled in by TapRoutinePanel so tests don't need Supabase auth
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

  it('clicking a standalone routine opens the unified TapRoutinePanel editor', async () => {
    setup()
    fireEvent.click(screen.getByText('Trash night'))
    // TapRoutinePanel shows the "Add a step" input from RoutineStepsSection
    await waitFor(() => expect(screen.getByLabelText(/add a step/i)).toBeInTheDocument())
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
    fireEvent.click(screen.getByRole('button', { name: /combine into a routine/i }))
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Morning', expect.arrayContaining(['a', 'b']))
  })

  it('section header shows "Multi-step" not "Collections"', () => {
    setup()
    expect(screen.getByText(/multi-step/i)).toBeInTheDocument()
    expect(screen.queryByText(/^collections$/i)).not.toBeInTheDocument()
  })

  it('count excludes steps: c1 + flat = 2 routines', () => {
    setup()
    expect(screen.getByText('2 routines')).toBeInTheDocument()
  })

  it('New routine button: creates the collection then opens the editor', async () => {
    const createdRoutine = r('newc', 'Morning', { parent_routine_id: undefined })
    const onCreateCollection = vi.fn().mockResolvedValue(createdRoutine)
    vi.spyOn(window, 'prompt').mockReturnValue('Morning')
    render(<RoutinesListRedesign
      routines={[createdRoutine]} onSelectRoutine={vi.fn()} onCreateRoutine={vi.fn()} onUpdateRoutine={vi.fn()}
      onAddStep={vi.fn()} onReorderSteps={vi.fn()} onPromoteStep={vi.fn()}
      onCreateCollection={onCreateCollection} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /new routine/i }))
    })
    expect(onCreateCollection).toHaveBeenCalledWith('Morning')
    // Panel should open — the collection editor contains the "Add a step" input
    await waitFor(() => expect(screen.getByLabelText(/add a step/i)).toBeInTheDocument())
  })
})

afterEach(() => vi.restoreAllMocks())
