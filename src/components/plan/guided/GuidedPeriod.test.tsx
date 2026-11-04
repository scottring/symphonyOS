import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

import { GuidedPeriod, type PeriodSessionTools, type SessionFold } from './GuidedPeriod'
import { PlanChip } from '@/components/guide/GuideCoach'
import { stepsFor } from '@/lib/guide/steps'

const shell = { reg: null as GuidedSessionRegistration | null }
function Shell() {
  const reg = useGuidedSession()
  useEffect(() => { shell.reg = reg })
  return reg ? <div data-testid="guide-panel">{reg.header}</div> : null
}
const panel = () => within(screen.getByTestId('guide-panel'))
const guideSteps = () => store.patches.map((x) => (x.p.guide as { current?: string } | undefined)?.current)

function Where() { return <output data-testid="where">{useLocation().search}</output> }
// The page as GuidedPeriod draws it: what its folds are asked to do, and the
// sheet above's look back when there is one.
function Page({ fold }: { fold: SessionFold }) {
  return <section aria-label="The month">
    <PlanChip level="month" word="November" onStart={vi.fn()} />
    November goals
    <output data-testid="drive">{JSON.stringify(fold.drive)}</output>
    {fold.look && <aside aria-label="Sheet above">{fold.look}</aside>}
  </section>
}
const drive = () => JSON.parse(screen.getByTestId('drive').textContent ?? '{}')
// The session's one tooltip (GuideCoach) and the step it shows.
const coach = () => within(screen.getByRole('dialog', { name: 'Planning guide' }))
const stepNow = () => document.querySelector('.coach-t')?.textContent
const next = async (n = 1) => { for (let i = 0; i < n; i++) await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Next' })) }) }
const setup = (over: Partial<Parameters<typeof GuidedPeriod>[0]> = {}, url = '/plan?plan=1') => {
  const props = {
    level: 'month' as const, token: '2026-11', periodLabel: 'November',
    page: (fold: SessionFold) => <Page fold={fold} />,
    look: (t: PeriodSessionTools) => <div>
      <label>Went well<input value={t.lookDraft?.wentWell ?? ''} onChange={(e) => t.setLookDraft({ wentWell: e.target.value, didnt: '' })} /></label>
    </div>,
    onFinish: vi.fn(async () => true),
    onLeave: vi.fn(),
    onPlanned: vi.fn(),
    aboveLines: [{ id: 's1', title: 'Get the house ready' }],
    areas: [{ id: 'a1', name: 'Home', context: 'family' as const }],
    ...over,
  }
  render(<MemoryRouter initialEntries={[url]}><GuidedSessionProvider><GuidedPeriod {...props} /><Shell /><Where /></GuidedSessionProvider></MemoryRouter>)
  return props
}

beforeEach(() => {
  store.notes = {}; store.patches = []; store.fail = false
  shell.reg = null
})

describe('GuidedPeriod — Month, Season and Year while planning: a few tooltips on the same page', () => {
  it('Month: one tooltip, step 1 of 6, over the period’s own page; the header is in the conversation', () => {
    setup()
    const session = screen.getByRole('region', { name: 'Planning November' })
    expect(coach().getByText(`Step 1 of ${stepsFor('month').length}`)).toBeInTheDocument()
    expect(stepNow()).toBe('Fresh start')
    // No drop card: Fresh start's editor is not drawn in the session.
    expect(screen.queryByText('Pick a scenery')).toBeNull()
    expect(within(session).getByRole('region', { name: 'The month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Planning November · 1 of 6' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Steps in this session' })).toBeNull()
    expect(panel().getByText('Fresh start')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ level: 'month', token: '2026-11', threadKey: 'monthly:2026-11', stepId: 'fresh-start', periodLabel: 'November' })
    expect(shell.reg?.sessionContext.guide).toMatchObject({
      level: 'month', stepId: 'fresh-start', writes: ['note'],
      aboveLines: [{ id: 's1', title: 'Get the house ready' }], areas: [{ id: 'a1', name: 'Home', context: 'family' }],
    })
    expect(shell.reg?.sessionContext).toMatchObject({ horizon: 'monthly', aboveTitles: ['Get the house ready'] })
  })

  it('each step drives the page’s folds: the look back turns the sheet above to last month, Read the season opens it, the next weeks open the calendar', async () => {
    setup()
    expect(drive()).toEqual({})
    await next()
    expect(shell.reg?.stepId).toBe('look-back')
    expect(drive()).toEqual({ above: true })
    expect(within(screen.getByRole('complementary', { name: 'Sheet above' })).getByLabelText('Went well')).toBeInTheDocument()
    expect(shell.reg).toMatchObject({ token: '2026-11', threadKey: 'monthly:2026-11' })
    await next()
    expect(drive()).toEqual({ above: true })
    expect(screen.queryByRole('complementary', { name: 'Sheet above' })).toBeNull()
    await next()
    expect(stepNow()).toBe('Next 4–5 weeks')
    expect(drive()).toEqual({ calendar: true })
    await next()
    // The month by area writes on the sheet, Fall open beside it.
    expect(drive()).toEqual({ above: true })
    expect(screen.queryByText(/Never drawn/)).toBeNull()
  })

  it('resuming opens the saved step', () => {
    store.notes = { guide: { current: 'by-area', done: ['fresh-start', 'look-back', 'read-season', 'next-weeks'], skipped: [] } }
    setup()
    expect(stepNow()).toBe('The month by area')
    expect(panel().getByText('The month by area')).toBeInTheDocument()
  })

  it('Next and Back move and are saved; Stop planning writes nothing more', async () => {
    const p = setup()
    await next(2)
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Back' })) })
    expect(guideSteps()).toEqual(['look-back', 'read-season', 'look-back'])
    const before = store.patches.length
    fireEvent.click(screen.getByRole('button', { name: 'Stop planning' }))
    expect(p.onLeave).toHaveBeenCalled()
    expect(store.patches).toHaveLength(before)
  })

  // The tooltip owns navigation. One Next on the page; the conversation's
  // header explains the step and moves nothing.
  it('there is one Next, the tooltip’s; the conversation’s header has no Next, Skip or Done', () => {
    setup()
    expect(screen.getAllByRole('button', { name: 'Next' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^(Next step|Skip this step)$/ })).toBeNull()
    expect(panel().getByRole('button', { name: 'Explain more' })).toBeInTheDocument()
  })

  it('the chip shows the hidden tooltip again; its ✕ stops planning', () => {
    const p = setup()
    fireEvent.click(coach().getByRole('button', { name: 'Hide the guide' }))
    expect(screen.queryByRole('dialog', { name: 'Planning guide' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Planning November · 1 of 6' }))
    expect(stepNow()).toBe('Fresh start')
    expect(p.onLeave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop planning' }))
    expect(p.onLeave).toHaveBeenCalled()
  })

  it('a write saved on the page itself, at the month by area, marks November planned, once', async () => {
    store.notes = { guide: { current: 'by-area', done: [], skipped: [] } }
    let listener: (() => void) | null = null
    const off = vi.fn()
    const p = setup({ listenPageWrites: (l) => { listener = l; return off } })
    await act(async () => { listener?.() })
    expect(p.onPlanned).toHaveBeenCalledTimes(1)
    const marks = store.patches.filter((x) => (x.p.guide as { plannedAt?: string }).plannedAt)
    expect(marks).toHaveLength(1)
    expect(marks[0].defaults).toMatchObject({ savedAt: expect.any(String) })
    // A change card applied afterwards does not mark it again.
    await act(async () => { shell.reg?.onApplied?.() })
    await act(async () => { listener?.() })
    expect(store.patches).toHaveLength(1)
    expect(p.onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a change card applied at the month by area marks it planned; on another step, nothing', async () => {
    const p = setup()
    await act(async () => { shell.reg?.onApplied?.() })
    expect(store.patches).toHaveLength(0)
    expect(p.onPlanned).not.toHaveBeenCalled()
    cleanup()
    store.notes = { guide: { current: 'by-area', done: [], skipped: [] } }
    const q = setup()
    await act(async () => { shell.reg?.onApplied?.() })
    expect(q.onPlanned).toHaveBeenCalledTimes(1)
  })

  it('a look back draft survives going to another step and back, and Done hands it to the closing writes', async () => {
    store.notes = { guide: { current: 'look-back', done: ['fresh-start'], skipped: [] } }
    const p = setup()
    fireEvent.change(screen.getByLabelText('Went well'), { target: { value: 'Cabin booked' } })
    await next()
    expect(screen.queryByLabelText('Went well')).toBeNull()
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Back' })) })
    expect(screen.getByLabelText('Went well')).toHaveValue('Cabin booked')
    // To the last step, then Done planning November on the tooltip.
    await next(4)
    expect(stepNow()).toBe('Maintenance and fun')
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Done planning November' })) })
    expect(p.onFinish).toHaveBeenCalledWith({ wentWell: 'Cabin booked', didnt: '' })
    await waitFor(() => expect(p.onLeave).toHaveBeenCalled())
    expect((store.notes.guide as { finishedAt?: string }).finishedAt).toEqual(expect.any(String))
  })

  it('a closing write that failed keeps the session open', async () => {
    store.notes = { guide: { current: 'upkeep-fun', done: [], skipped: [] } }
    const p = setup({ onFinish: vi.fn(async () => false) })
    await act(async () => { fireEvent.click(coach().getByRole('button', { name: 'Done planning November' })) })
    expect(p.onFinish).toHaveBeenCalledWith(null)
    expect(p.onLeave).not.toHaveBeenCalled()
    expect((store.notes.guide as { finishedAt?: string }).finishedAt).toBeUndefined()
  })

  it('Season and Year use their own steps and finish label', async () => {
    store.notes = { guide: { current: 'wild-cards', done: [], skipped: [] } }
    setup({ level: 'season', token: '2026-fall', periodLabel: 'Fall' })
    expect(coach().getByText('Step 7 of 7')).toBeInTheDocument()
    expect(coach().getByRole('button', { name: 'Done planning Fall' })).toBeInTheDocument()
    // The tooltip owns navigation: the conversation's header has none.
    expect(panel().queryByRole('button', { name: /Done planning|Next|Skip/ })).toBeNull()
    expect(shell.reg).toMatchObject({ level: 'season', threadKey: 'seasonal:2026-fall' })
  })
})

describe('GuidedPeriod — ?step= opens the session on a step', () => {
  it('a valid step id opens on it once, and leaves the URL', async () => {
    setup({}, '/plan?plan=1&step=look-back')
    store.notes = {}
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('?plan=1'))
    expect(stepNow()).toBe('Look back at last month')
    expect(guideSteps()).toContain('look-back')
  })

  it('an id that is not a step of this level is ignored (and cleared)', async () => {
    setup({}, '/plan?plan=1&step=nonsense')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('?plan=1'))
    expect(stepNow()).toBe('Fresh start')
    expect(store.patches).toHaveLength(0)
  })

  it('Year: step=landscape opens the landscape step', async () => {
    setup({ level: 'year', token: '2027', periodLabel: '2027' }, '/plan?plan=1&step=landscape')
    await waitFor(() => expect(stepNow()).toBe('Map the 12 months'))
  })
})
