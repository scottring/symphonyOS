import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom'
import { deckModeOf } from '@/lib/planning/deck'

const session = { saved: null as null | { authorId: string; at: Date }, mine: null, loading: false, loadedToken: '', error: null as null | string, reload: vi.fn(), save: vi.fn() }
const activity = { changeSet: null as null | { state: string }, receipt: null as null | { state: string } }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-9-27' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/contexts/CanvasActivityContext', () => ({ useCanvasActivity: () => activity }))
const review = { reviewed: null as null | { at: Date; authorId: string; wentWell: string; didnt: string }, mine: null, loading: false, error: null, reload: vi.fn(), finish: vi.fn(async () => true) }
vi.mock('@/hooks/usePeriodReview', () => ({ usePeriodReview: () => review }))
// The guided session's place in the week (usePlanningNotes): on its last step,
// so "Done planning the week" is the header's primary.
const seed = { notes: { guide: { current: 'family', done: [], skipped: [] } } as Record<string, unknown> }
vi.mock('@/hooks/usePlanningNotes', async () => {
  const { useState, useCallback } = await import('react')
  return {
    usePlanningNotes: () => {
      const [notes, setNotes] = useState<Record<string, unknown>>(seed.notes)
      const patch = useCallback(async (p: Record<string, unknown>) => { setNotes((n) => ({ ...n, ...p })); return true }, [])
      return { notes, loading: false, error: null, patch, reload: () => undefined }
    },
  }
})

import { WeekV2, type WeekDeck } from './WeekV2'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { PageHelpContext } from '@/components/explain/PageHelp'
import { LearnPageContext } from '@/components/learn/LearnVideoChip'
import { WEEK_PREF_KEYS } from '@/hooks/useWeekViewPrefs'
import { GuidedSessionProvider, useGuidedSession } from '@/contexts/GuidedSessionContext'

// A fixed Tuesday: the week's own last day changes what the toolbar offers,
// so these tests must not ride the wall clock.
beforeEach(() => { activity.changeSet = null; activity.receipt = null; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 12)) })
afterEach(() => { vi.useRealTimers(); localStorage.clear(); seed.notes = { guide: { current: 'family', done: [], skipped: [] } } })

const renderWeek = (props: Partial<React.ComponentProps<typeof WeekV2>> = {}) => render(
  <MemoryRouter>
    <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent {...props} />
  </MemoryRouter>,
)

// Week page, calm pass 2 (Scott approved the mockup 2026-10-18): the header
// is the title row, one quiet fact line, one primary button and a ⋯ menu.
// "Help me plan the rest of my week" (the Chat bar carries it) and "I’m
// happy with this week" (finishing the deck marks the week) are gone.
const slotsFor = () => {
  const subline = document.createElement('div')
  const controls = document.createElement('div')
  document.body.append(subline, controls)
  return { subline, controls, done: () => { subline.remove(); controls.remove() } }
}

describe('WeekV2 header — one primary button and the ⋯ menu', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; session.save.mockReset(); review.reviewed = null })

  it('on the desk, the masthead holds exactly one primary button and the ⋯ menu', () => {
    const slots = slotsFor()
    const { container } = render(
      <MemoryRouter>
        <PlanMastheadSlotsContext.Provider value={slots}>
          <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent deck={makeDeck()} />
        </PlanMastheadSlotsContext.Provider>
      </MemoryRouter>,
    )
    expect(container.querySelector('.pv2-toolbar')).toBeNull()
    const controls = within(slots.controls)
    expect(slots.controls.querySelectorAll('.pv2-btn')).toHaveLength(1)
    expect(controls.getByRole('button', { name: 'Plan this week' })).toHaveClass('pv2-btn')
    expect(controls.getByRole('button', { name: 'Week options' })).toHaveAttribute('aria-haspopup', 'menu')
    expect(controls.getAllByRole('button')).toHaveLength(2)
    slots.done()
  })

  it('on a phone, the page keeps the same reduction in its own row', () => {
    const { container } = renderWeek({ deck: makeDeck() })
    const head = container.querySelector('.wk-head') as HTMLElement
    expect(head).toBeTruthy()
    expect(head.querySelectorAll('.pv2-btn')).toHaveLength(1)
    expect(within(head).getByRole('button', { name: 'Plan this week' })).toBeTruthy()
    expect(within(head).getByRole('button', { name: 'Week options' })).toBeTruthy()
  })

  it('neither removed action renders, mid-week or on a week ahead', () => {
    renderWeek({ deck: makeDeck() })
    expect(screen.queryByRole('button', { name: /^Help me plan/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I’m happy with this week' })).toBeNull()
    expect(screen.queryByText(/isn’t (marked )?planned yet/)).toBeNull()
    cleanup()
    renderWeek({ weekStart: new Date(2026, 9, 4), isCurrent: false })
    expect(screen.queryByRole('button', { name: /^Help me plan/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I’m happy with this week' })).toBeNull()
  })

  it('where the deck may not open there is no primary button, only the ⋯ menu', () => {
    renderWeek({ weekStart: new Date(2026, 9, 4), isCurrent: false, deck: makeDeck({ available: false }) })
    expect(document.querySelectorAll('.pv2-btn')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Week options' })).toBeTruthy()
  })

  it('the ⋯ menu toggles the page’s view choices, remembered on this device', () => {
    renderWeek({ deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    const menu = within(screen.getByRole('menu', { name: 'Week options' }))
    const items = menu.getAllByRole('menuitemcheckbox').map((i) => i.getAttribute('aria-label') ?? i.textContent)
    expect(items).toEqual(['Show free time', 'Show weather', 'Show done', 'Show daily routines in each day'])
    for (const [name, key] of [['Show free time', WEEK_PREF_KEYS.freeTime], ['Show weather', WEEK_PREF_KEYS.weather], ['Show done', WEEK_PREF_KEYS.done], ['Show daily routines in each day', WEEK_PREF_KEYS.dailyInDays]] as const) {
      const item = menu.getByRole('menuitemcheckbox', { name })
      expect(item).toHaveAttribute('aria-checked', 'false')
      fireEvent.click(item)
      expect(localStorage.getItem(key)).toBe('shown')
      expect(menu.getByRole('menuitemcheckbox', { name })).toHaveAttribute('aria-checked', 'true')
    }
    fireEvent.click(menu.getByRole('menuitemcheckbox', { name: 'Show done' }))
    expect(localStorage.getItem(WEEK_PREF_KEYS.done)).toBe('hidden')
    // Escape closes it and hands focus back.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Week options' })).toHaveFocus()
  })

  it('the ⋯ menu closes when focus leaves it, but not when it moves inside it', () => {
    const { container } = renderWeek({ deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    const [first, second] = screen.getAllByRole('menuitemcheckbox')
    fireEvent.focusOut(first, { relatedTarget: second })
    expect(screen.getByRole('menu')).toBeTruthy()
    const outside = document.createElement('button'); container.append(outside)
    fireEvent.focusOut(second, { relatedTarget: outside })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the ⋯ menu has no “Talk it through” (planning is the guided session)', () => {
    renderWeek({ deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    expect(screen.queryByRole('menuitem', { name: 'Talk it through' })).toBeNull()
  })

  it('How this page works and Watch the guide open what the ? and ▷ opened', () => {
    const help = vi.fn()
    render(
      <MemoryRouter>
        <PageHelpContext.Provider value={help}>
          <LearnPageContext.Provider value="week">
            <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent deck={makeDeck()} />
          </LearnPageContext.Provider>
        </PageHelpContext.Provider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'How this page works' }))
    expect(help).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Watch the guide' }))
    expect(screen.getByRole('dialog', { name: 'Review and choose what comes next' })).toBeTruthy()
  })

  it('without a page guide or video, the menu offers neither', () => {
    renderWeek({ deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    expect(screen.queryByRole('menuitem', { name: 'How this page works' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Watch the guide' })).toBeNull()
  })
})

describe('WeekV2 header — the fact line', () => {
  beforeEach(() => { session.saved = null; review.reviewed = null; review.loading = false })

  // One count on every horizon (reviewed design, 2026-10-20): this week's,
  // done out of everything on it, with its bar; last week's lives in Looking back.
  it('"{done} of {all} done", a bar, then today; "planned {Weekday}" is the summary line’s', () => {
    renderAt('/week', { deck: makeDeck({ doneThisWeek: 4, onThisWeek: 16 }), today: 'Kaleb’s baseball' })
    expect(document.querySelector('.wk-facts')?.textContent).toBe('4 of 16 done · Today: Kaleb’s baseball')
    expect(screen.getByRole('img', { name: '4 of 16 done' }).querySelector('span')).toHaveStyle({ width: '25%' })
    cleanup()
    session.saved = { authorId: 'me', at: new Date(2026, 8, 27, 18) } // Sunday
    renderAt('/week', { deck: makeDeck({ doneThisWeek: 4, onThisWeek: 16 }), today: 'Kaleb’s baseball' })
    // When it was planned is the summary line's, not the facts'.
    expect(document.querySelector('.wk-facts')?.textContent).toBe('4 of 16 done · Today: Kaleb’s baseball')
    expect(document.querySelector('.guide-summary-line')?.textContent).toBe('Planned Sun')
  })

  // ⋯ no longer offers "Review last week" (it opened the same deck as Plan
  // this week) or "Plan next week early" (that deck never opened mid-week).
  it('⋯ offers no review of last week and no early plan of next week', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 27, 18) }
    renderAt('/week', { deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    expect(screen.queryByRole('menuitem', { name: 'Review last week' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /^Plan next week/ })).toBeNull()
  })

  it('planned, mid-week: no button; planning again waits in ⋯', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 27, 18) }
    renderAt('/week', { deck: makeDeck() })
    expect(document.querySelectorAll('.pv2-btn')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    const items = within(screen.getByRole('menu', { name: 'Week options' })).getAllByRole('menuitem').map((i) => i.textContent)
    expect(items.filter((t) => /^(Plan|Review) /.test(t ?? ''))).toEqual(['Plan this week again'])
  })

  it('on the desk it is the masthead’s subline', () => {
    const slots = slotsFor()
    render(
      <MemoryRouter>
        <PlanMastheadSlotsContext.Provider value={slots}>
          <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent deck={makeDeck()} today="Dentist" />
        </PlanMastheadSlotsContext.Provider>
      </MemoryRouter>,
    )
    expect(slots.subline.textContent).toBe('Today: Dentist')
    slots.done()
  })

  it('where the deck may not open there is no count, only today', () => {
    renderAt('/week', { deck: makeDeck({ available: false }), today: 'Dentist' })
    expect(document.querySelector('.wk-facts')?.textContent).toBe('Today: Dentist')
  })
})

describe('WeekV2 — the last day', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })

  it('on its last day the nudge points at next week’s Plan, with no Plan and no mark', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 12))
    renderWeek({ canvas: <section aria-label="The days">canvas</section> })
    expect(screen.getByRole('region', { name: 'The days' })).toBeTruthy()
    expect(screen.getByText(/ends today/)).toBeTruthy()
    expect(screen.getByText(/Use Plan on next week to plan the week ahead/)).toBeTruthy()
    expect(screen.queryByText(/Open Chat/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Plan / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I’m happy with this week' })).toBeNull()
  })
})

// Review and Plan open the guided session on the page (spec 2026-11-01): the
// steps rail stands beside the week, and Leave or Done planning gives the
// week back. The session itself is GuidedWeek.test's.
function Where() { return <output data-testid="where">{useLocation().search}</output> }
const where = () => new URLSearchParams(screen.getByTestId('where').textContent ?? '')
const makeDeck = (over: Partial<WeekDeck> = {}): WeekDeck => ({
  mode: null, available: true, cards: [], doneLastWeek: 3, aged: 0, stripDays: [], onSeeAged: vi.fn(), onFinish: vi.fn(async () => true),
  actions: { done: vi.fn(), placeOnDay: vi.fn(), keepThisWeek: vi.fn(), later: vi.fn(), laterOnDate: vi.fn(), letGo: vi.fn(), drain: vi.fn() },
  choose: { monthWord: 'October', lines: [], doneLines: [], loose: [], onAddLoose: vi.fn(async () => true), onDropIn: vi.fn(async () => false as const), placeItems: [], placedCount: 0 },
  ...over,
})
// Done planning the week: the step header's button (the shell shows it above
// the conversation; Shell stands in for it).
const finishPlanning = async () => {
  fireEvent.click(within(await screen.findByTestId('guide-panel')).getByRole('button', { name: 'Done planning the week' }))
}
function Shell() {
  const reg = useGuidedSession()
  return reg ? <div data-testid="guide-panel">{reg.header}</div> : null
}
// WeekViewV2's part, standing in: the deck's mode is read off the URL, on a
// week that may open it.
function WithDeck({ deck, ...props }: Partial<React.ComponentProps<typeof WeekV2>>) {
  const [params] = useSearchParams()
  const withMode = deck && { ...deck, mode: deck.available ? deckModeOf(params) : null }
  return <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent canvas={<p>The days</p>} {...props} deck={withMode} />
}
const renderAt = (url: string, props: Partial<React.ComponentProps<typeof WeekV2>> = {}) => render(
  <MemoryRouter initialEntries={[url]}>
    <GuidedSessionProvider>
      <WithDeck {...props} />
      <Shell />
      <Where />
    </GuidedSessionProvider>
  </MemoryRouter>,
)

describe('WeekV2 — Review opens the deck', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; review.finish.mockClear(); review.reviewed = null })

  // Reviewed design (2026-10-20): on the week's last day, until it is
  // reviewed, the one button is "Review this week" — the deck on the week
  // after, which looks back at this one. Reviewed, no button.
  it('on the week’s last day, "Review this week" opens the deck on the week after; Leave closes it', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9))
    const deck = makeDeck()
    renderAt('/week', { deck })
    expect(document.querySelectorAll('.pv2-btn')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Review this week' }))
    expect(screen.getByRole('region', { name: 'Planning the week' })).toBeTruthy()
    expect(where().get('plan')).toBe('1')
    expect(where().get('date')).toBe('2026-10-04')
    expect(screen.queryByRole('button', { name: /^(Review|Plan) / })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByText('The days')).toBeTruthy()
    expect(where().get('plan')).toBeNull()
    expect(deck.onFinish).not.toHaveBeenCalled()
    expect(review.finish).not.toHaveBeenCalled()
  })

  it('"Review this week" opens next week’s session on its Look back at this one', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9))
    seed.notes = { guide: { current: 'look-back', done: [], skipped: [] } }
    renderAt('/week', { deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Review this week' }))
    expect(within(screen.getByRole('region', { name: 'Planning the week' })).getByLabelText('What went well')).toBeTruthy()
  })

  it('Done planning the week saves a Look back draft as last week’s review notes', async () => {
    seed.notes = { guide: { current: 'look-back', done: [], skipped: [] } }
    review.finish.mockClear()
    renderAt('/week?plan=1', { deck: makeDeck() })
    fireEvent.change(await screen.findByLabelText('What went well'), { target: { value: ' Rested ' } })
    fireEvent.change(screen.getByLabelText('What didn’t'), { target: { value: 'Late nights' } })
    // Walk on to the last step: the draft outlives Look back's body.
    const panel = within(screen.getByTestId('guide-panel'))
    for (let i = 0; i < 8 && !panel.queryByRole('button', { name: 'Done planning the week' }); i++) {
      fireEvent.click(panel.getByRole('button', { name: 'Next step' }))
      await screen.findByTestId('guide-panel')
    }
    await finishPlanning()
    await vi.waitFor(() => expect(review.finish).toHaveBeenCalledWith({ wentWell: 'Rested', didnt: 'Late nights' }))
    await vi.waitFor(() => expect(where().get('plan')).toBeNull())
  })

  it('reviewed on its last day: no button', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9))
    review.reviewed = { at: new Date(2026, 9, 3, 8), authorId: 'me', wentWell: '', didnt: '' }
    renderAt('/week', { deck: makeDeck() })
    expect(document.querySelectorAll('.pv2-btn')).toHaveLength(0)
  })

  it('planning again opens the deck here; finishing records last week’s review and returns to the week', async () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 27, 18) }
    const deck = makeDeck()
    renderAt('/week', { deck })
    expect(screen.queryByRole('button', { name: 'Review this week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Plan this week again' }))
    expect(where().get('plan')).toBe('1')
    expect(where().get('date')).toBeNull()
    await finishPlanning()
    await vi.waitFor(() => expect(review.finish).toHaveBeenCalledWith({ wentWell: '', didnt: '' }))
    expect(deck.onFinish).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(where().get('plan')).toBeNull())
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(screen.getByText('The days')).toBeTruthy()
  })

  // Calm pass 2: the full deck's end is the week's planning, so it marks the
  // week planned (the record "I’m happy with this week" wrote; Home's
  // checklist reads it) — only once the drain and the review both held.
  it('finishing the full deck marks the week planned, after the drain and the review', async () => {
    session.save.mockReset(); session.save.mockResolvedValue(true)
    const order: string[] = []
    review.finish.mockImplementation(async () => { order.push('review'); return true })
    session.save.mockImplementationOnce(async () => { order.push('planned'); return true })
    const deck = makeDeck({ onFinish: vi.fn(async () => { order.push('drain'); return true }) })
    renderAt('/week?plan=1', { deck })
    await finishPlanning()
    await vi.waitFor(() => expect(session.save).toHaveBeenCalledTimes(1))
    expect(session.save).toHaveBeenCalledWith({ wentWell: '', didnt: '', focus: undefined })
    // The close records last week's review after the drain, then marks this week.
    expect(order).toEqual(['drain', 'review', 'planned'])
    review.finish.mockImplementation(async () => true)
    await vi.waitFor(() => expect(where().get('plan')).toBeNull())
  })

  // Fix round 1 ruling: on the week's own last day, finishing the deck there
  // records last week's review but marks nothing planned (the old bar offered
  // no mark on the last day either).
  it('finishing the full deck on the current week’s last day does not mark it planned', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9)) // Saturday, the last day of Sep 27 – Oct 3
    session.save.mockReset(); review.finish.mockClear()
    renderAt('/week?review=1', { deck: makeDeck() })
    await finishPlanning()
    await vi.waitFor(() => expect(review.finish).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(where().get('review')).toBeNull())
    expect(session.save).not.toHaveBeenCalled()
  })

  it('a failed drain or review leaves the week unmarked; Place them never marks it', async () => {
    session.save.mockReset()
    renderAt('/week?plan=1', { deck: makeDeck({ onFinish: vi.fn(async () => false) }) })
    await finishPlanning()
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Planning the week' })).toBeTruthy())
    expect(where().get('plan')).toBe('1')
    expect(session.save).not.toHaveBeenCalled()
    cleanup()
    // Last week's review fails to save: it says so and marks nothing.
    review.finish.mockImplementationOnce(async () => false)
    renderAt('/week?review=1', { deck: makeDeck() })
    await finishPlanning()
    await vi.waitFor(() => expect(review.finish).toHaveBeenCalled())
    expect(session.save).not.toHaveBeenCalled()
    cleanup()
    renderAt('/week?place=1', { deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('The days')).toBeTruthy()
    expect(session.save).not.toHaveBeenCalled()
  })

  it('offers last week’s review until that one is done; a coming week offers none', () => {
    review.reviewed = { at: new Date(2026, 8, 27), authorId: 'me', wentWell: '', didnt: '' }
    renderAt('/week', { deck: makeDeck() })
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
    cleanup()
    review.reviewed = null
    renderAt('/week', { isCurrent: false, weekStart: new Date(2026, 9, 4), deck: makeDeck({ available: false }) })
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
  })

  it('waits for the tasks before dealing: neither the deck nor the canvas while they load', () => {
    renderAt('/week?review=1', { deck: makeDeck({ loading: true }) })
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(screen.queryByText('Nothing left without a home')).toBeNull()
    expect(screen.queryByText('The days')).toBeNull()
  })

  it('without a deck (the v1 week) there is no review', () => {
    renderWeek()
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
  })
})

// The everyday line (spec 2026-11-01): what this week's planning left behind,
// in one quiet line under the title. "Looked back" reads: this week's session
// did its Look back step, or last week's review was recorded.
describe('WeekV2 — the planning summary line', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; review.reviewed = null })

  it('says when it was planned, the energy and that it looked back', () => {
    seed.notes = { guide: { current: 'family', done: ['look-back'], skipped: [], plannedAt: new Date(2026, 8, 27, 18).toISOString() }, energy: { level: 'medium' } }
    renderAt('/week', { deck: makeDeck() })
    expect(document.querySelector('.guide-summary-line')?.textContent).toBe('Planned Sun · energy: medium · looked back')
  })

  it('counts last week’s recorded review as having looked back', () => {
    seed.notes = { guide: { current: 'family', done: [], skipped: [], plannedAt: new Date(2026, 8, 27, 18).toISOString() } }
    review.reviewed = { at: new Date(2026, 8, 26), authorId: 'me', wentWell: '', didnt: '' }
    renderAt('/week', { deck: makeDeck() })
    expect(document.querySelector('.guide-summary-line')?.textContent).toBe('Planned Sun · looked back')
  })

  it('with nothing saved there is no line', () => {
    renderAt('/week', { deck: makeDeck() })
    expect(document.querySelector('.guide-summary-line')).toBeNull()
  })

  it('is not drawn while the session is open', () => {
    seed.notes = { guide: { current: 'family', done: [], skipped: [], plannedAt: new Date(2026, 8, 27, 18).toISOString() } }
    renderAt('/week?plan=1', { deck: makeDeck() })
    expect(document.querySelector('.guide-summary-line')).toBeNull()
  })

  it('on the desk it sits in the masthead beside the facts', () => {
    seed.notes = { guide: { current: 'family', done: [], skipped: [], plannedAt: new Date(2026, 8, 27, 18).toISOString() } }
    const slots = slotsFor()
    render(
      <MemoryRouter>
        <PlanMastheadSlotsContext.Provider value={slots}>
          <WeekV2 weekStart={new Date(2026, 8, 27)} isCurrent deck={makeDeck()} today="Dentist" />
        </PlanMastheadSlotsContext.Provider>
      </MemoryRouter>,
    )
    expect(slots.subline.querySelector('.guide-summary-line')?.textContent).toBe('Planned Sun')
    slots.done()
  })
})

describe('WeekV2 — Plan and Place them open the deck', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; review.finish.mockClear() })

  it('Plan this week opens the session on the page, beside the same week, with no mark in the bar', () => {
    renderAt('/week', { deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Plan this week' }))
    const planning = screen.getByRole('region', { name: 'Planning the week' })
    expect(within(planning).getByRole('group', { name: 'Steps in this session' })).toBeTruthy()
    // The page never disappears behind a session screen.
    expect(within(planning).getByText('The days')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I’m happy with this week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(screen.getByText('The days')).toBeTruthy()
  })

  it('a week the deck may not open on offers neither Review nor Plan, and ignores the URL', () => {
    renderAt('/week?review=1', { deck: makeDeck({ available: false }) })
    expect(screen.queryByRole('region', { name: 'Planning the week' })).toBeNull()
    expect(screen.getByText('The days')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Plan this week' })).toBeNull()
  })

  it('a week that is over, or ends today, has no Plan', () => {
    // A past week: the deck may not open there, so neither Plan nor Review.
    renderAt('/week', { isCurrent: false, weekStart: new Date(2026, 8, 20), deck: makeDeck({ available: false }) })
    expect(screen.queryByRole('button', { name: /^Plan the week of/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
    cleanup()
    vi.setSystemTime(new Date(2026, 9, 3, 12))
    renderAt('/week', { deck: makeDeck() })
    expect(screen.queryByRole('button', { name: 'Plan this week' })).toBeNull()
  })

  it('?place=1 opens the deck in place mode; finishing records no review and returns to the week', async () => {
    const deck = makeDeck()
    renderAt('/week?place=1', { deck })
    expect(screen.getByRole('region', { name: 'Plan this week' })).toBeTruthy()
    // Place them opens straight on the days.
    expect(screen.getByRole('heading', { name: 'Give them a day' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('The days')).toBeTruthy()
    expect(where().get('place')).toBeNull()
    expect(deck.onFinish).not.toHaveBeenCalled()
    expect(review.finish).not.toHaveBeenCalled()
  })
})
