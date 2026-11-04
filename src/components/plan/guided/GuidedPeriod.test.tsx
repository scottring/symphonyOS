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
import { RibbonTab } from '@/components/guide/GuideRibbon'
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
    November goals
    <output data-testid="drive">{JSON.stringify(fold.drive)}</output>
    {fold.look && <aside aria-label="Sheet above">{fold.look}</aside>}
  </section>
}
const drive = () => JSON.parse(screen.getByTestId('drive').textContent ?? '{}')
const band = () => within(screen.getByRole('region', { name: 'Plan November' }))
const stepNow = () => band().getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'step')?.querySelector('.ribbon-step-title')?.textContent
const setup = (over: Partial<Parameters<typeof GuidedPeriod>[0]> = {}, url = '/plan?plan=1') => {
  const props = {
    level: 'month' as const, token: '2026-11', periodLabel: 'November',
    page: (fold: SessionFold) => <Page fold={fold} />,
    bodies: (t: PeriodSessionTools) => ({
      'fresh-start': <p>Pick a scenery</p>,
      'look-back': <div>
        <label>Went well<input value={t.lookDraft?.wentWell ?? ''} onChange={(e) => t.setLookDraft({ wentWell: e.target.value, didnt: '' })} /></label>
      </div>,
      'by-area': <p>Never drawn: the month by area writes on the sheet</p>,
    }),
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

describe('GuidedPeriod — Month, Season and Year while planning: a ribbon on the same page', () => {
  it('Month: the ribbon’s band lists the six steps over the period’s own page; the header is in the conversation', () => {
    setup()
    const session = screen.getByRole('region', { name: 'Planning November' })
    expect(band().getAllByRole('listitem').map((li) => li.querySelector('.ribbon-step-title')?.textContent))
      .toEqual(stepsFor('month').map((s) => s.title))
    expect(stepNow()).toBe('Fresh start')
    // Fresh start has its own editor: in the card under the band.
    expect(within(screen.getByRole('region', { name: 'Fresh start' })).getByText('Pick a scenery')).toBeInTheDocument()
    expect(within(session).getByRole('region', { name: 'The month' })).toBeInTheDocument()
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
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(shell.reg?.stepId).toBe('look-back')
    expect(drive()).toEqual({ above: true })
    expect(within(screen.getByRole('complementary', { name: 'Sheet above' })).getByLabelText('Went well')).toBeInTheDocument()
    // The look back is on the sheet above, never in the card.
    expect(document.querySelector('.ribbon-card')).toBeNull()
    expect(shell.reg).toMatchObject({ token: '2026-11', threadKey: 'monthly:2026-11' })
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(drive()).toEqual({ above: true })
    expect(screen.queryByRole('complementary', { name: 'Sheet above' })).toBeNull()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Next 4–5 weeks/ })) })
    expect(drive()).toEqual({ calendar: true })
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    // The month by area writes on the sheet, Fall open beside it: no card.
    expect(drive()).toEqual({ above: true })
    expect(screen.queryByText(/Never drawn/)).toBeNull()
    // Leave hands the folds back: the page is no longer driven.
  })

  it('resuming opens the saved step', () => {
    store.notes = { guide: { current: 'by-area', done: ['fresh-start', 'look-back', 'read-season', 'next-weeks'], skipped: [] } }
    setup()
    expect(stepNow()).toBe('The month by area')
    expect(panel().getByText('The month by area')).toBeInTheDocument()
  })

  it('Next, Back and Skip move and are saved; Leave writes nothing more', async () => {
    const p = setup()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Skip this step' })) })
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Back' })) })
    expect(guideSteps()).toEqual(['look-back', 'read-season', 'look-back'])
    const before = store.patches.length
    fireEvent.click(band().getByRole('button', { name: 'Leave' }))
    expect(p.onLeave).toHaveBeenCalled()
    expect(store.patches).toHaveLength(before)
  })

  it('pulling the bookmark again is Leave', () => {
    const p = setup({ page: () => <article><RibbonTab label="Plan November" onPull={vi.fn()} /></article> })
    fireEvent.click(screen.getByRole('button', { name: 'Plan November', expanded: true }))
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
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Next' })) })
    expect(screen.queryByLabelText('Went well')).toBeNull()
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Look back at last month/ })) })
    expect(screen.getByLabelText('Went well')).toHaveValue('Cabin booked')
    // To the last step, then Done planning November on the band.
    await act(async () => { fireEvent.click(band().getByRole('button', { name: /Maintenance and fun/ })) })
    await act(async () => { fireEvent.click(band().getByRole('button', { name: 'Done planning November' })) })
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

  it('planned before the session opened, the band says so quietly; planned during it, it does not', () => {
    const { unmount } = render(<MemoryRouter><GuidedSessionProvider><GuidedPeriod level="month" token="2026-11" periodLabel="November" page={null} bodies={() => ({})}
      onFinish={vi.fn(async () => true)} onLeave={vi.fn()} plannedAt={new Date(2026, 9, 3)} /></GuidedSessionProvider></MemoryRouter>)
    expect(band().getByText('November was planned Oct 3. You can still change it.')).toBeInTheDocument()
    unmount()
    render(<MemoryRouter><GuidedSessionProvider><GuidedPeriod level="month" token="2026-11" periodLabel="November" page={null} bodies={() => ({})}
      onFinish={vi.fn(async () => true)} onLeave={vi.fn()} plannedAt={new Date(Date.now() + 1000)} /></GuidedSessionProvider></MemoryRouter>)
    expect(screen.queryByText(/was planned/)).toBeNull()
  })

  it('Season and Year use their own steps and finish label', async () => {
    store.notes = { guide: { current: 'wild-cards', done: [], skipped: [] } }
    setup({ level: 'season', token: '2026-fall', periodLabel: 'Fall' })
    const fall = within(screen.getByRole('region', { name: 'Plan Fall' }))
    expect(fall.getAllByRole('listitem')).toHaveLength(7)
    expect(fall.getByRole('button', { name: 'Done planning Fall' })).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Done planning Fall' })).toBeInTheDocument()
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
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Plan 2027' })).getByRole('button', { name: /Map the 12 months/ })).toHaveAttribute('aria-current', 'step'))
  })
})
