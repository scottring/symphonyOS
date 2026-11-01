import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { GuidedSessionProvider, useGuidedSession, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'

// The person's notes row for the month, in memory: what usePlanningNotes reads
// and patch merges into (the real merge is usePlanningNotes' own test).
const store = vi.hoisted(() => ({ notes: {} as Record<string, unknown>, patches: [] as { p: Record<string, unknown>; defaults?: Record<string, unknown> }[], fail: false }))
vi.mock('@/hooks/usePlanningNotes', async () => {
  const { useState, useCallback } = await import('react')
  return {
    usePlanningNotes: () => {
      const [notes, setNotes] = useState(store.notes)
      const patch = useCallback(async (p: Record<string, unknown>, defaults?: Record<string, unknown>) => {
        if (store.fail) return false
        store.patches.push({ p, defaults })
        store.notes = { ...defaults, ...store.notes, ...p }
        setNotes(store.notes)
        return true
      }, [])
      return { notes, loading: false, error: null, patch, reload: () => undefined }
    },
  }
})

import { GuidedPeriod, type PeriodSessionTools } from './GuidedPeriod'
import { stepsFor } from '@/lib/guide/steps'

const shell = { reg: null as GuidedSessionRegistration | null }
function Shell() {
  const reg = useGuidedSession()
  useEffect(() => { shell.reg = reg })
  return reg ? <div data-testid="guide-panel">{reg.header}</div> : null
}
const panel = () => within(screen.getByTestId('guide-panel'))
const guideSteps = () => store.patches.map((x) => (x.p.guide as { current?: string } | undefined)?.current)

const write = vi.fn(async () => true)
const setup = (over: Partial<Parameters<typeof GuidedPeriod>[0]> = {}) => {
  const props = {
    level: 'month' as const, token: '2026-11', periodLabel: 'November',
    page: <section aria-label="The month">November goals</section>,
    bodies: (t: PeriodSessionTools) => {
      const reported = t.report(write)
      return {
        'fresh-start': <p>Pick a scenery</p>,
        'look-back': <div>
          <label>Went well<input value={t.lookDraft?.wentWell ?? ''} onChange={(e) => t.setLookDraft({ wentWell: e.target.value, didnt: '' })} /></label>
        </div>,
        'by-area': <button type="button" onClick={() => { void reported() }}>Bring it into November</button>,
      }
    },
    onFinish: vi.fn(async () => true),
    onLeave: vi.fn(),
    onPlanned: vi.fn(),
    aboveLines: [{ id: 's1', title: 'Get the house ready' }],
    areas: [{ id: 'a1', name: 'Home', context: 'family' as const }],
    ...over,
  }
  render(<GuidedSessionProvider><GuidedPeriod {...props} /><Shell /></GuidedSessionProvider>)
  return props
}

beforeEach(() => {
  store.notes = {}; store.patches = []; store.fail = false
  shell.reg = null
  write.mockReset(); write.mockImplementation(async () => true)
})

describe('GuidedPeriod — Month, Season and Year while planning', () => {
  it('Month: six steps in the rail, the session line, the page beside it, the header in the conversation', () => {
    setup()
    const session = screen.getByRole('region', { name: 'Planning November' })
    expect(within(session).getByText(/Planning November · step 1 of 6 ·/)).toBeInTheDocument()
    const rail = within(session).getByRole('group', { name: 'Steps in this session' })
    expect(within(rail).getAllByRole('listitem').map((li) => li.querySelector('.guide-rail-title')?.textContent))
      .toEqual(stepsFor('month').map((s) => s.title))
    expect(within(session).getByText('Pick a scenery')).toBeInTheDocument()
    expect(within(session).getByRole('region', { name: 'The month' })).toBeInTheDocument()
    expect(panel().getByText('Fresh start')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'month', token: '2026-11', threadKey: 'monthly:2026-11', stepId: 'fresh-start', periodLabel: 'November' })
    expect(shell.reg?.sessionContext.guide).toMatchObject({
      level: 'month', stepId: 'fresh-start', writes: ['note'],
      aboveLines: [{ id: 's1', title: 'Get the house ready' }], areas: [{ id: 'a1', name: 'Home', context: 'family' }],
    })
    expect(shell.reg?.sessionContext).toMatchObject({ horizon: 'monthly', aboveTitles: ['Get the house ready'] })
  })

  it('resuming opens the saved step', () => {
    store.notes = { guide: { current: 'by-area', done: ['fresh-start', 'look-back', 'read-season', 'next-weeks'], skipped: [] } }
    setup()
    expect(screen.getByText(/Planning November · step 5 of 6/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bring it into November' })).toBeInTheDocument()
    expect(panel().getByText('The month by area')).toBeInTheDocument()
  })

  it('Next and Skip move on and are saved; Leave writes nothing more', async () => {
    const p = setup()
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Skip this step' })) })
    expect(guideSteps()).toEqual(['look-back', 'read-season'])
    const before = store.patches.length
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(p.onLeave).toHaveBeenCalled()
    expect(store.patches).toHaveLength(before)
  })

  it('the first write applied at the month by area marks November planned, once', async () => {
    store.notes = { guide: { current: 'by-area', done: [], skipped: [] } }
    const p = setup()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bring it into November' })) })
    expect(write).toHaveBeenCalled()
    const marks = store.patches.filter((x) => (x.p.guide as { plannedAt?: string }).plannedAt)
    expect(marks).toHaveLength(1)
    expect(marks[0].defaults).toMatchObject({ savedAt: expect.any(String) })
    expect(p.onPlanned).toHaveBeenCalledTimes(1)
    // A change card applied afterwards does not mark it again.
    await act(async () => { shell.reg?.onApplied?.() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bring it into November' })) })
    expect(store.patches).toHaveLength(1)
    expect(p.onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a write that did not save, or one on another step, does not mark it planned; a change card applied there does', async () => {
    store.notes = { guide: { current: 'by-area', done: [], skipped: [] } }
    write.mockImplementation(async () => false)
    const p = setup()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bring it into November' })) })
    expect(store.patches).toHaveLength(0)
    expect(p.onPlanned).not.toHaveBeenCalled()
    await act(async () => { shell.reg?.onApplied?.() })
    expect(p.onPlanned).toHaveBeenCalledTimes(1)
  })

  it('on another step, applying marks nothing', async () => {
    const p = setup()
    await act(async () => { shell.reg?.onApplied?.() })
    expect(store.patches).toHaveLength(0)
    expect(p.onPlanned).not.toHaveBeenCalled()
  })

  it('a write saved on the page itself counts at the month by area', async () => {
    store.notes = { guide: { current: 'by-area', done: [], skipped: [] } }
    let listener: (() => void) | null = null
    const off = vi.fn()
    const p = setup({ listenPageWrites: (l) => { listener = l; return off } })
    await act(async () => { listener?.() })
    expect(p.onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a look back draft survives going to another step and back, and Done hands it to the closing writes', async () => {
    store.notes = { guide: { current: 'look-back', done: ['fresh-start'], skipped: [] } }
    const p = setup()
    fireEvent.change(screen.getByLabelText('Went well'), { target: { value: 'Cabin booked' } })
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Next step' })) })
    expect(screen.queryByLabelText('Went well')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Look back at last month/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to this step' })) })
    expect(screen.getByLabelText('Went well')).toHaveValue('Cabin booked')
    // To the last step, then Done.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Maintenance and fun/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to this step' })) })
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Done planning November' })) })
    expect(p.onFinish).toHaveBeenCalledWith({ wentWell: 'Cabin booked', didnt: '' })
    await waitFor(() => expect(p.onLeave).toHaveBeenCalled())
    expect((store.notes.guide as { finishedAt?: string }).finishedAt).toEqual(expect.any(String))
  })

  it('a closing write that failed keeps the session open', async () => {
    store.notes = { guide: { current: 'upkeep-fun', done: [], skipped: [] } }
    const p = setup({ onFinish: vi.fn(async () => false) })
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Done planning November' })) })
    expect(p.onFinish).toHaveBeenCalledWith(null)
    expect(p.onLeave).not.toHaveBeenCalled()
    expect((store.notes.guide as { finishedAt?: string }).finishedAt).toBeUndefined()
  })

  it('planned before the session opened, the session line says so quietly; planned during it, it does not', () => {
    const { unmount } = render(<GuidedSessionProvider><GuidedPeriod level="month" token="2026-11" periodLabel="November" page={null} bodies={() => ({})}
      onFinish={vi.fn(async () => true)} onLeave={vi.fn()} plannedAt={new Date(2026, 9, 3)} /></GuidedSessionProvider>)
    expect(screen.getByText('November was planned Oct 3. You can still change it.')).toBeInTheDocument()
    unmount()
    render(<GuidedSessionProvider><GuidedPeriod level="month" token="2026-11" periodLabel="November" page={null} bodies={() => ({})}
      onFinish={vi.fn(async () => true)} onLeave={vi.fn()} plannedAt={new Date(Date.now() + 1000)} /></GuidedSessionProvider>)
    expect(screen.queryByText(/was planned/)).toBeNull()
  })

  it('Season and Year use their own steps and finish label', async () => {
    store.notes = { guide: { current: 'wild-cards', done: [], skipped: [] } }
    setup({ level: 'season', token: '2026-fall', periodLabel: 'Fall' })
    expect(screen.getByText(/Planning Fall · step 7 of 7 ·/)).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Done planning Fall' })).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'season', threadKey: 'seasonal:2026-fall' })
  })
})
