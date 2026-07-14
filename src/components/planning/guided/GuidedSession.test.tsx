// src/components/planning/guided/GuidedSession.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GuidedSession } from './GuidedSession'
import type { GuidedHost } from './GuidedContext'

// The shell persists progress via usePlanningSession — stub it. The stub is a
// real (tiny) hook so tests can reproduce the real hook's shape: it starts
// with `loading`/`notes` from module-level mutable state, and — when a test
// arms `pendingAsyncNotes` — resolves to new notes/loading asynchronously,
// exactly like the real Supabase-backed load.
const patchNotes = vi.fn()
let mockNotes: Record<string, unknown> = {}
let mockLoading = false
let pendingAsyncNotes: Record<string, unknown> | null = null
let lastSessionToken: string | null = null
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: (_horizon: string, periodToken: string) => {
    lastSessionToken = periodToken
    const [loading, setLoading] = useState(mockLoading)
    const [notes, setNotes] = useState(mockNotes)
    useEffect(() => {
      if (!pendingAsyncNotes) return
      const arriving = pendingAsyncNotes
      Promise.resolve().then(() => {
        setNotes(arriving)
        setLoading(false)
      })
    }, [])
    return { notes, patchNotes, loading }
  },
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
  beforeEach(() => {
    mockNotes = {}
    mockLoading = false
    pendingAsyncNotes = null
    patchNotes.mockClear()
    localStorage.clear()
  })

  it('renders step 1 narration and progress', () => {
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 1 of 8/)).toBeInTheDocument()
    expect(screen.getByText('A fresh season')).toBeInTheDocument()
  })

  it('Next advances, Back returns, and progress persists', () => {
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    expect(screen.getByText(/Step 2 of 8/)).toBeInTheDocument()
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 1 })
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText(/Step 1 of 8/)).toBeInTheDocument()
  })

  it('resumes from a persisted stepIndex', () => {
    mockNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 4 of 8/)).toBeInTheDocument()
  })

  it('clamps an out-of-range persisted stepIndex', () => {
    mockNotes = { stepIndex: 99 }
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 8 of 8/)).toBeInTheDocument()
  })

  it('Finish on the last step resets progress and closes', () => {
    mockNotes = { stepIndex: 7 }
    const onClose = vi.fn()
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 0 })
    expect(onClose).toHaveBeenCalled()
  })

  it('Finish prefers onFinished over onClose when provided', () => {
    mockNotes = { stepIndex: 7 }
    const onClose = vi.fn()
    const onFinished = vi.fn()
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={onClose} onFinished={onFinished} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(onFinished).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the header X abandons via onClose, never onFinished', () => {
    const onClose = vi.fn()
    const onFinished = vi.fn()
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={onClose} onFinished={onFinished} />)
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
    expect(onClose).toHaveBeenCalled()
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('chain button on the last step completes and hands over to the next horizon', () => {
    mockNotes = { stepIndex: 7 } // seasonal last step; seasonal chains to monthly
    const onClose = vi.fn()
    const onChain = vi.fn()
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={onClose} onChain={onChain} />)
    fireEvent.click(screen.getByRole('button', { name: /Plan the month now/ }))
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 0 })
    expect(onChain).toHaveBeenCalledWith('monthly')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('no chain button without an onChain handler or on unchained sessions', () => {
    mockNotes = { stepIndex: 7 }
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Plan the month now/ })).toBeNull()
  })

  it('daily completion flips the daily auto-mute flag', () => {
    mockNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="daily" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(localStorage.getItem('guided.daily.completed')).toBe('1')
  })

  it('mute toggle persists per horizon', () => {
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Mute narration/ }))
    expect(localStorage.getItem('guided.muted.seasonal')).toBe('1')
  })

  it('shows a quiet placeholder instead of step content while the session is loading', () => {
    mockLoading = true
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Gathering your session/)).toBeInTheDocument()
    expect(screen.queryByText('A fresh season')).not.toBeInTheDocument()
  })

  it('resumes from notes.stepIndex once an asynchronous session load resolves', async () => {
    mockLoading = true
    mockNotes = {}
    pendingAsyncNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    // Nothing to resume from yet — the shell shows chrome, not step 1's content.
    expect(screen.getByText(/Gathering your session/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Step 4 of 8/)).toBeInTheDocument()
    })
  })

  it('re-syncs safely when the horizon prop changes while mounted', () => {
    const { rerender } = render(<GuidedSession horizon="seasonal" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    // Navigate deep into the 8-step seasonal session — well past the daily
    // session's 4 steps — before switching horizons.
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    expect(screen.getByText(/Step 6 of 8/)).toBeInTheDocument()

    // Switching to daily (only 4 steps) must not crash reading a stale index,
    // and should resync to daily's own persisted position (none set -> Step 1).
    rerender(<GuidedSession horizon="daily" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument()
  })
})

describe('GuidedSession domain mode', () => {
  beforeEach(() => {
    mockNotes = {}
    mockLoading = false
    pendingAsyncNotes = null
    patchNotes.mockClear()
    lastSessionToken = null
    localStorage.clear()
  })

  it('universal uses the bare period token (pre-existing rows stay valid)', () => {
    render(<GuidedSession horizon="weekly" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(lastSessionToken).not.toBeNull()
    expect(lastSessionToken).not.toContain('|')
  })

  it('a domain session keys its own planning_sessions row via the |domain suffix', () => {
    render(<GuidedSession horizon="weekly" domain="work" host={makeHost()} onClose={vi.fn()} />)
    expect(lastSessionToken).toMatch(/\|work$/)
  })

  it('shows the domain chip only in domain sessions', () => {
    const { unmount } = render(<GuidedSession horizon="weekly" domain="work" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText('Work')).toBeInTheDocument()
    unmount()
    render(<GuidedSession horizon="weekly" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.queryByText('Work')).not.toBeInTheDocument()
  })

  it('renders a byDomain narration variant in place of the whole-life line', () => {
    // monthly look-within has a work variant; navigate isn't needed — jump via
    // persisted stepIndex (step 6 = look-within, index 5).
    mockNotes = { stepIndex: 5 }
    render(<GuidedSession horizon="monthly" domain="work" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/colleague, a client, or a commitment/)).toBeInTheDocument()
    expect(screen.queryByText(/each other or the kids/)).not.toBeInTheDocument()
  })

  it('universal keeps the original whole-life narration', () => {
    mockNotes = { stepIndex: 5 }
    render(<GuidedSession horizon="monthly" domain="universal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/each other or the kids/)).toBeInTheDocument()
  })
})
