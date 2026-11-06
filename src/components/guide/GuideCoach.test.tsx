import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { GuidedSessionProvider } from '@/contexts/GuidedSessionContext'

// Planning is a few tooltips on the everyday page (Scott, 2026-11-04): a plan
// chip in the header starts the session, and each step is one paper tooltip
// pointing at the real thing on the page. No band, no drop card, no bookmark,
// and the conversation never opens by itself.

const store = vi.hoisted(() => ({ notes: {} as Record<string, unknown>, loading: false }))
vi.mock('@/hooks/usePlanningNotes', async () => {
  const { useState, useCallback } = await import('react')
  return {
    usePlanningNotes: () => {
      const [notes, setNotes] = useState(store.notes)
      const patch = useCallback(async (p: Record<string, unknown>, defaults?: Record<string, unknown>) => {
        store.notes = { ...defaults, ...store.notes, ...p }
        setNotes(store.notes)
        return true
      }, [])
      return { notes, loading: store.loading, error: null, patch, reload: () => undefined }
    },
  }
})
const launcher = vi.hoisted(() => ({ openAssistant: vi.fn() }))
vi.mock('@/contexts/AssistantLaunchContext', async (orig) => ({
  ...(await orig<object>()),
  useAssistantLauncher: () => launcher,
}))
const sound = vi.hoisted(() => ({ crinkle: vi.fn(), stamp: vi.fn() }))
vi.mock('@/lib/fold/paperSound', () => ({ paperSound: { crinkle: sound.crinkle, stamp: sound.stamp } }))

import { GuidedPeriod, type SessionFold } from '@/components/plan/guided/GuidedPeriod'
import { GuideCoach, PlanChip, PlannedStamp } from './GuideCoach'

// November as the page draws it: the header with its title and plan chip,
// the sheet with the calendar's edge at its right and the write line on a
// writing step. The fold's drive is written out so a test can read it.
function MonthPage({ titled = true, stacked = false }: { titled?: boolean; stacked?: boolean }) {
  const [planning, setPlanning] = useState(false)
  const [marked, setMarked] = useState(false)
  const sheet = (fold?: SessionFold) => (
    <article>
      <output data-testid="drive">{JSON.stringify(fold?.drive ?? {})}</output>
      {marked && !planning && <PlannedStamp at={new Date(2026, 10, 4)} />}
      <ul data-guide-anchor="list"><li>Book the cabin</li></ul>
      {fold?.write && <form data-guide-anchor="write"><input aria-label="Write a November goal" /></form>}
      <div data-fold-mode={stacked ? 'v' : 'h'}><aside data-guide-anchor="right">November calendar</aside></div>
    </article>
  )
  return <>
    <header>
      {titled && <h1 data-guide-anchor="title">November 2026</h1>}
      <PlanChip level="month" word="November" onStart={() => setPlanning(true)} />
    </header>
    {planning
      ? <GuidedPeriod level="month" token="2026-11" periodLabel="November" words={{ prev: 'October', above: 'Fall' }} page={sheet} look={() => <p>Pick a scenery</p>}
          onFinish={async () => { setMarked(true); return true }} onLeave={() => setPlanning(false)} />
      : sheet()}
  </>
}
const show = (titled?: boolean, stacked?: boolean) => render(<MemoryRouter><GuidedSessionProvider><MonthPage titled={titled} stacked={stacked} /></GuidedSessionProvider></MemoryRouter>)
const coach = () => screen.getByRole('dialog', { name: 'Planning guide' })
const tip = () => within(coach())
const drive = () => JSON.parse(screen.getByTestId('drive').textContent ?? '{}')
const next = async () => { await act(async () => { fireEvent.click(tip().getByRole('button', { name: 'Next' })) }) }
const start = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Plan November' })) }) }

beforeEach(() => {
  store.notes = {}; store.loading = false
  launcher.openAssistant.mockClear(); sound.crinkle.mockClear(); sound.stamp.mockClear()
})
afterEach(() => { vi.restoreAllMocks() })

// Where each anchor is laid out (happy-dom lays nothing out).
const rects = { write: { left: 300, top: 400, right: 680, bottom: 430 } }
function mockRects() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = this.getAttribute('data-guide-anchor')
    const r = at === 'right' ? { left: 700, top: 100, right: 990, bottom: 700 }
      : at === 'title' ? { left: 40, top: 20, right: 400, bottom: 60 }
        : at === 'write' ? rects.write
          : { left: 0, top: 0, right: 0, bottom: 0 }
    return { ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r } as DOMRect
  })
}
const frame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })

describe('GuideCoach — planning is a few tooltips on the everyday page', () => {
  it('the header chip “Plan November” starts a session; the chip counts the steps and the tooltip shows the first', async () => {
    show()
    expect(screen.queryByRole('dialog')).toBeNull()
    await start()
    expect(screen.getByRole('button', { name: 'Planning November · 1 of 6' })).toBeInTheDocument()
    expect(tip().getByText('Step 1 of 6')).toBeInTheDocument()
    expect(tip().getByText('Fresh start')).toBeInTheDocument()
    expect(tip().getByText('Mark the turn of the month.')).toBeInTheDocument()
    expect(tip().getByText(/pick November's scenery\. It's only a visual signal that October is closed/)).toBeInTheDocument()
    expect(tip().getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('Next moves on, the chip follows, and “Next 4–5 weeks” drives the calendar open', async () => {
    show()
    await start()
    await next()
    expect(tip().getByText('Step 2 of 6')).toBeInTheDocument()
    expect(tip().getByText('Look back at October')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Planning November · 2 of 6' })).toBeInTheDocument()
    expect(sound.crinkle).toHaveBeenCalled()
    await next(); await next()
    expect(tip().getByText("November's calendar")).toBeInTheDocument()
    expect(drive()).toEqual({ calendar: true })
    await act(async () => { fireEvent.click(tip().getByRole('button', { name: 'Back' })) })
    expect(tip().getByText('Read Fall')).toBeInTheDocument()
  })

  it('the tooltip’s ✕ hides it and the chip stays; the chip shows it again; Escape hides it too', async () => {
    show()
    await start()
    fireEvent.click(tip().getByRole('button', { name: 'Hide the guide' }))
    expect(screen.queryByRole('dialog', { name: 'Planning guide' })).toBeNull()
    const chip = screen.getByRole('button', { name: 'Planning November · 1 of 6' })
    fireEvent.click(chip)
    expect(tip().getByText('Step 1 of 6')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Planning guide' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop planning' })).toBeInTheDocument()
  })

  it('the chip’s ✕ ends the session: no tooltip, and the folds are the reader’s again', async () => {
    store.notes = { guide: { current: 'next-weeks', done: [], skipped: [] } }
    show()
    await start()
    expect(drive()).toEqual({ calendar: true })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop planning' })) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(drive()).toEqual({})
    expect(screen.getByRole('button', { name: 'Plan November' })).toBeInTheDocument()
  })

  it('“Done planning November” on the last step stamps the sheet', async () => {
    store.notes = { guide: { current: 'upkeep-fun', done: [], skipped: [] } }
    show()
    await start()
    expect(tip().getByText('Step 6 of 6')).toBeInTheDocument()
    await act(async () => { fireEvent.click(tip().getByRole('button', { name: 'Done planning November' })) })
    expect(screen.getByRole('img', { name: 'Planned Nov 4' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Plan November' })).toBeInTheDocument()
  })

  it('points at the element marked with the step’s anchor; with none on the page, at the page title', async () => {
    store.notes = { guide: { current: 'next-weeks', done: [], skipped: [] } }
    mockRects()
    show()
    await start()
    // November's calendar: the calendar's edge, the tooltip at its left, low
    // in the view so the top of November's list stays in sight (2026-11-05).
    expect(coach()).toHaveAttribute('data-at', 'right')
    expect(coach()).toHaveAttribute('data-side', 'right')
    expect(coach().style.transform).toBe('translate(686px, 676px)')
    // The month by area: the write line, the tooltip under it, and lit.
    await next()
    expect(coach()).toHaveAttribute('data-at', 'write')
    expect(coach().style.transform).toBe('translate(308px, 442px)')
    expect(document.querySelector('[data-guide-anchor="write"]')).toHaveAttribute('data-guide-lit')
    // Maintenance and fun has no write line drawn: still the page, never 0,0.
    await next()
    expect(document.querySelector('[data-guide-lit]')).toBeNull()
    expect(coach()).toHaveAttribute('data-at', 'title')
    expect(coach().style.transform).toBe('translate(48px, 72px)')
  })

  it('follows its anchor when the page moves under it after the settle (a ResizeObserver), once a frame', async () => {
    rects.write = { left: 300, top: 400, right: 680, bottom: 430 }
    const observers: { cb: ResizeObserverCallback; targets: Element[] }[] = []
    vi.stubGlobal('ResizeObserver', class {
      targets: Element[] = []
      constructor(cb: ResizeObserverCallback) { observers.push({ cb, targets: this.targets }) }
      observe(el: Element) { this.targets.push(el) }
      unobserve() {}
      disconnect() {}
    })
    try {
      store.notes = { guide: { current: 'by-area', done: [], skipped: [] } }
      mockRects()
      show()
      await start()
      expect(coach().style.transform).toBe('translate(308px, 442px)')
      const live = observers.at(-1)!
      expect(live.targets).toContain(document.querySelector('[data-guide-anchor="write"]'))
      expect(live.targets).toContain(document.body)
      // The 900ms settle is over: nothing follows by itself any more.
      vi.spyOn(performance, 'now').mockReturnValue(1e12)
      await frame(); await frame()
      // A line written above it: the write line moves down 40px.
      rects.write = { left: 300, top: 440, right: 680, bottom: 470 }
      await frame()
      expect(coach().style.transform).toBe('translate(308px, 442px)')
      live.cb([], {} as ResizeObserver); live.cb([], {} as ResizeObserver)
      await frame()
      expect(coach().style.transform).toBe('translate(308px, 482px)')
    } finally { vi.unstubAllGlobals() }
  })

  it('a write line above the sheet folded open at the left: the tooltip sits beside what it draws, never over the sheet (2026-11-06)', async () => {
    // The Week as drawn: a full-width composer row with a short card at its
    // left, and the month's sheet open below it, on the left.
    const at = (el: HTMLElement) => el.getAttribute('data-guide-anchor') ?? el.parentElement?.getAttribute('data-guide-anchor')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const own = this.getAttribute('data-guide-anchor')
      const r = own === 'write' ? { left: 50, top: 100, right: 990, bottom: 240 }
        : own === 'left' ? { left: 50, top: 260, right: 400, bottom: 760 }
          : !own && at(this) === 'write' ? { left: 60, top: 110, right: 360, bottom: 230 }
            : { left: 0, top: 0, right: 0, bottom: 0 }
      return { ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r } as DOMRect
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(290)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(210)
    render(<MemoryRouter><GuidedSessionProvider>
      <div data-guide-anchor="write"><form><input aria-label="Add to this week" /></form></div>
      <div data-fold-mode="h"><div data-guide-anchor="left"><ul><li>Make a budget</li></ul></div></div>
      <GuideCoach level="week" current="choose" word="this week" onNext={vi.fn()} onBack={vi.fn()} onFinish={vi.fn()} onStop={vi.fn()} />
    </GuidedSessionProvider></MemoryRouter>)
    await frame()
    expect(coach()).toHaveAttribute('data-side', 'left')
    expect(coach().style.transform).toBe('translate(374px, 100px)')
  })

  it('on a stacked fold (a phone) it sits under the calendar’s edge, not beside it', async () => {
    store.notes = { guide: { current: 'next-weeks', done: [], skipped: [] } }
    mockRects()
    show(true, true)
    await start()
    expect(coach()).toHaveAttribute('data-at', 'right')
    expect(coach()).toHaveAttribute('data-side', 'top')
  })

  it('Escape taken by something else (defaultPrevented) leaves it shown', async () => {
    show()
    await start()
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    e.preventDefault()
    act(() => { document.dispatchEvent(e) })
    expect(coach()).toBeInTheDocument()
  })

  it('while the session’s place loads, the chip waits (disabled) and there is no tooltip yet', async () => {
    store.loading = true
    show()
    await start()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Plan November' })).toBeDisabled()
  })

  it('with no anchor and no title on the page it still sits on screen', async () => {
    show(false)
    await start()
    expect(coach()).toHaveAttribute('data-at', '')
    const [, x, y] = /translate\((-?\d+)px, (-?\d+)px\)/.exec(coach().style.transform) ?? []
    expect(Number(x)).toBeGreaterThanOrEqual(12)
    expect(Number(y)).toBeGreaterThanOrEqual(12)
  })

  it('no band, no ribbon tab, no drop card, and the conversation is not opened', async () => {
    show()
    await start()
    await next()
    expect(document.querySelector('.guide-band, .ribbon-band, .ribbon-tab, .ribbon-card, .ribbon-session')).toBeNull()
    // Fresh start had a card: it draws nothing now (its place is the page's ⋯).
    expect(screen.queryByText('Pick a scenery')).toBeNull()
    expect(launcher.openAssistant).not.toHaveBeenCalled()
  })

  it('reduced motion: the tooltip comes in without its entrance', async () => {
    const mm = window.matchMedia
    window.matchMedia = ((q: string) => ({ ...mm(q), matches: q.includes('reduce') })) as typeof window.matchMedia
    try {
      show()
      await start()
      expect(coach()).not.toHaveClass('is-in')
    } finally { window.matchMedia = mm }
  })

  // Share and book (Year): the tooltip asks the step's one small fact, the
  // booking date; sharing is each goal's own space.
  it('a step that books carries its button in the tooltip; it runs once and says it is done; a failure says so', async () => {
    const run = vi.fn(async () => false)
    const coachFor = () => <MemoryRouter><GuideCoach level="year" current="share-book" word="2026" onNext={vi.fn()} onBack={vi.fn()} onFinish={vi.fn()} onStop={vi.fn()}
      ask={{ kind: 'book', label: 'Book the first Winter session', done: () => 'Booked: Plan Winter, Tue, Dec 1', run }} /></MemoryRouter>
    const { rerender } = render(coachFor())
    await act(async () => { fireEvent.click(tip().getByRole('button', { name: 'Book the first Winter session' })) })
    expect(run).toHaveBeenCalledTimes(1)
    expect(tip().getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
    run.mockResolvedValue(true)
    rerender(coachFor())
    await act(async () => { fireEvent.click(tip().getByRole('button', { name: 'Book the first Winter session' })) })
    expect(tip().getByRole('status')).toHaveTextContent('Booked: Plan Winter, Tue, Dec 1')
    expect(tip().queryByRole('button', { name: 'Book the first Winter session' })).toBeNull()
    expect(tip().queryByRole('alert')).toBeNull()
  })
  // Scott, 2026-11-05: "a way to hide tooltips so experts can breeze through".
  it('Hide tips keeps the title, Back and Next, remembered for every session; the title opens the words for that step', async () => {
    localStorage.removeItem('symphony-coach:short')
    const props = { level: 'month' as const, word: 'November', words: { this: 'November', prev: 'October', above: 'Fall' }, onNext: vi.fn(), onBack: vi.fn(), onFinish: vi.fn(), onStop: vi.fn() }
    const { rerender, unmount } = render(<MemoryRouter><GuideCoach {...props} current="look-back" /></MemoryRouter>)
    expect(tip().getByText(/Close out October before planning November/)).toBeInTheDocument()
    fireEvent.click(tip().getByRole('button', { name: 'Hide tips' }))
    expect(tip().queryByText(/Close out October/)).toBeNull()
    expect(tip().getByRole('button', { name: /Look back at October/ })).toBeInTheDocument()
    expect(tip().getByRole('button', { name: 'Next' })).toBeInTheDocument()
    fireEvent.click(tip().getByRole('button', { name: /Look back at October/ }))
    expect(tip().getByText(/Close out October/)).toBeInTheDocument()
    rerender(<MemoryRouter><GuideCoach {...props} current="read-season" /></MemoryRouter>)
    expect(tip().queryByText(/Remember what this season is for/)).toBeNull()
    unmount()
    render(<MemoryRouter><GuideCoach {...props} current="read-season" /></MemoryRouter>)
    expect(tip().getByRole('button', { name: 'Show tips' })).toBeInTheDocument()
    fireEvent.click(tip().getByRole('button', { name: 'Show tips' }))
    expect(tip().getByText(/Remember what this season is for/)).toBeInTheDocument()
    expect(localStorage.getItem('symphony-coach:short')).toBeNull()
  })

  it('a step with no ask has no extra button', () => {
    render(<MemoryRouter><GuideCoach level="year" current="refine" word="2026" onNext={vi.fn()} onBack={vi.fn()} onFinish={vi.fn()} onStop={vi.fn()} /></MemoryRouter>)
    expect(tip().getAllByRole('button').map((b) => b.textContent)).toEqual(['Hide tips', 'Back', 'Next', '✕'])
  })

  // Fix round 1 (ruling): booking keeps a date.
  it('an action with a date opens the day first (its starting day), and Book it runs it on the day picked', async () => {
    const run = vi.fn(async () => true)
    render(<MemoryRouter><GuideCoach level="year" current="share-book" word="2026" onNext={vi.fn()} onBack={vi.fn()} onFinish={vi.fn()} onStop={vi.fn()}
      ask={{ kind: 'book', label: 'Book the first Winter session', date: { label: 'First Winter session', initial: new Date(2026, 11, 1) },
        done: (d) => `Booked: ${d?.getDate()}`, run }} /></MemoryRouter>)
    fireEvent.click(tip().getByRole('button', { name: 'Book the first Winter session' }))
    expect(run).not.toHaveBeenCalled()
    const date = tip().getByLabelText('First Winter session')
    expect(date).toHaveValue('2026-12-01')
    fireEvent.change(date, { target: { value: '2026-11-28' } })
    await act(async () => { fireEvent.click(tip().getByRole('button', { name: 'Book it' })) })
    expect(run).toHaveBeenCalledWith(new Date(2026, 10, 28))
    expect(tip().getByRole('status')).toHaveTextContent('Booked: 28')
  })

  // Final review: a double tap on Book it books once.
  it('Book it books once, however fast it is tapped twice', async () => {
    let resolve: (ok: boolean) => void = () => {}
    const run = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
    render(<MemoryRouter><GuideCoach level="year" current="share-book" word="2026" onNext={vi.fn()} onBack={vi.fn()} onFinish={vi.fn()} onStop={vi.fn()}
      ask={{ kind: 'book', label: 'Book the first Winter session', date: { label: 'First Winter session', initial: new Date(2026, 11, 1) },
        done: () => 'Booked', run }} /></MemoryRouter>)
    fireEvent.click(tip().getByRole('button', { name: 'Book the first Winter session' }))
    const book = tip().getByRole('button', { name: 'Book it' })
    // Both land before React renders again (one batch), as two quick taps can.
    act(() => { book.click(); book.click() })
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(true) })
    expect(tip().getByRole('status')).toHaveTextContent('Booked')
  })

  // Task 4 (Scott, 2026-11-04): a step that captures one small fact asks it
  // inside its own tooltip. Energy: Low · Medium · High.
  it('a step that asks a choice shows its choices in the tooltip; a pick saves and is shown chosen', async () => {
    const pick = vi.fn(async () => true)
    const coachFor = (value?: string) => <MemoryRouter><GuideCoach level="day" current="energy" word="today" onNext={vi.fn()} onBack={vi.fn()} onFinish={vi.fn()} onStop={vi.fn()}
      ask={{ kind: 'choice', label: 'Energy', value, pick, choices: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] }} /></MemoryRouter>
    const { rerender } = render(coachFor())
    const group = within(tip().getByRole('radiogroup', { name: 'Energy' }))
    expect(group.getAllByRole('radio').map((b) => b.textContent)).toEqual(['Low', 'Medium', 'High'])
    expect(group.getAllByRole('radio').every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true)
    await act(async () => { fireEvent.click(group.getByRole('radio', { name: 'Medium' })) })
    expect(pick).toHaveBeenCalledWith('medium')
    expect(group.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
    rerender(coachFor('medium'))
    expect(group.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
    // A pick that did not save says so, and shows what is saved.
    pick.mockResolvedValueOnce(false)
    await act(async () => { fireEvent.click(group.getByRole('radio', { name: 'High' })) })
    expect(tip().getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
    expect(group.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
  })
})
