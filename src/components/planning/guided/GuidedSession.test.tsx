// src/components/planning/guided/GuidedSession.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedSession } from './GuidedSession'
import type { GuidedHost } from './GuidedContext'

// The shell persists progress via usePlanningSession — stub it.
const patchNotes = vi.fn()
let mockNotes: Record<string, unknown> = {}
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ notes: mockNotes, patchNotes, loading: false }),
}))

function makeHost(): GuidedHost {
  return {
    tasks: [], tasksLoading: false, events: [], calendarConnected: false,
    fetchEvents: vi.fn(async () => {}), createEvent: vi.fn(async () => {}),
    onPushTask: vi.fn(), onSetBucket: vi.fn(), onCompleteTask: vi.fn(), onUpdateTask: vi.fn(),
    createTaskInBucket: vi.fn(async () => {}), createDatedTask: vi.fn(async () => {}),
    goals: [], goalAreas: [], addGoal: vi.fn(async () => null), addArea: vi.fn(async () => null),
    updateGoalStatus: vi.fn(async () => {}),
    routines: [], draggableRoutines: [], onScheduleRoutine: vi.fn(), getRoutinesForDate: () => [],
  }
}

describe('GuidedSession shell', () => {
  beforeEach(() => { mockNotes = {}; patchNotes.mockClear(); localStorage.clear() })

  it('renders step 1 narration and progress', () => {
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 1 of 7/)).toBeInTheDocument()
    expect(screen.getByText('A fresh season')).toBeInTheDocument()
  })

  it('Next advances, Back returns, and progress persists', () => {
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    expect(screen.getByText(/Step 2 of 7/)).toBeInTheDocument()
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 1 })
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText(/Step 1 of 7/)).toBeInTheDocument()
  })

  it('resumes from a persisted stepIndex', () => {
    mockNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 4 of 7/)).toBeInTheDocument()
  })

  it('clamps an out-of-range persisted stepIndex', () => {
    mockNotes = { stepIndex: 99 }
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 7 of 7/)).toBeInTheDocument()
  })

  it('Finish on the last step resets progress and closes', () => {
    mockNotes = { stepIndex: 6 }
    const onClose = vi.fn()
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 0 })
    expect(onClose).toHaveBeenCalled()
  })

  it('daily completion flips the daily auto-mute flag', () => {
    mockNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="daily" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(localStorage.getItem('guided.daily.completed')).toBe('1')
  })

  it('mute toggle persists per horizon', () => {
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Mute narration/ }))
    expect(localStorage.getItem('guided.muted.seasonal')).toBe('1')
  })
})
