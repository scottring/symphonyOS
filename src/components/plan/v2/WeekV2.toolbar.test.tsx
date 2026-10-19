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

import { WeekV2, type WeekDeck } from './WeekV2'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { PageHelpContext } from '@/components/explain/PageHelp'
import { LearnPageContext } from '@/components/learn/LearnVideoChip'
import { WEEK_PREF_KEYS } from '@/hooks/useWeekViewPrefs'

// A fixed Tuesday: the week's own last day changes what the toolbar offers,
// so these tests must not ride the wall clock.
beforeEach(() => { activity.changeSet = null; activity.receipt = null; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 12)) })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

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

  it('“Talk it through” is offered only where the page has one (phones)', () => {
    const talk = vi.fn()
    renderWeek({ deck: makeDeck(), talk })
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

  it('"{n} done last week · Review · Today: {first item}"; Review opens the deck', () => {
    renderAt('/week', { deck: makeDeck(), today: 'Kaleb’s baseball' })
    const line = document.querySelector('.wk-facts')
    expect(line?.textContent).toBe('3 done last week · Review · Today: Kaleb’s baseball')
    // The only Review on the page is the line’s own.
    expect(screen.getAllByRole('button', { name: /^Review/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(where().get('review')).toBe('1')
    expect(screen.getByRole('region', { name: 'Plan this week' })).toBeTruthy()
  })

  it('once last week is reviewed it says the weekday', () => {
    review.reviewed = { at: new Date(2026, 8, 26, 17), authorId: 'me', wentWell: '', didnt: '' } // Saturday
    renderAt('/week', { deck: makeDeck() })
    expect(document.querySelector('.wk-facts')?.textContent).toBe('3 done last week · reviewed Saturday')
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
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
    expect(slots.subline.textContent).toBe('3 done last week · Review · Today: Dentist')
    slots.done()
  })

  it('where the deck may not open there is no count, only today', () => {
    renderAt('/week', { deck: makeDeck({ available: false }), today: 'Dentist' })
    expect(document.querySelector('.wk-facts')?.textContent).toBe('Today: Dentist')
  })
})

describe('WeekV2 — the last day', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })

  it('on its last day the nudge points at Chat, with no Plan and no mark', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 12))
    renderWeek({ canvas: <section aria-label="The days">canvas</section> })
    expect(screen.getByRole('region', { name: 'The days' })).toBeTruthy()
    expect(screen.getByText(/ends today/)).toBeTruthy()
    expect(screen.getByText(/Open Chat to talk through the week ahead/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Plan / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I’m happy with this week' })).toBeNull()
  })
})

// Review and Plan open the deck (Friday session, Stage 1): the canvas gives
// way to it, and it gives way back. The deck itself is Deck.test's; here it is
// dealt nothing, so it opens straight on "Nothing left without a home".
function Where() { return <output data-testid="where">{useLocation().search}</output> }
const where = () => new URLSearchParams(screen.getByTestId('where').textContent ?? '')
const makeDeck = (over: Partial<WeekDeck> = {}): WeekDeck => ({
  mode: null, available: true, cards: [], doneLastWeek: 3, aged: 0, stripDays: [], onSeeAged: vi.fn(), onFinish: vi.fn(async () => true),
  actions: { done: vi.fn(), placeOnDay: vi.fn(), keepThisWeek: vi.fn(), later: vi.fn(), laterOnDate: vi.fn(), letGo: vi.fn(), drain: vi.fn() },
  choose: { monthWord: 'October', lines: [], doneLines: [], loose: [], onAddLoose: vi.fn(async () => true), onDropIn: vi.fn(async () => false as const), placeItems: [], placedCount: 0 },
  ...over,
})
// Plan this week, start to end: Choose, then Give them a day, then Done planning.
const finishPlanning = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Give them a day' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done planning' }))
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
    <WithDeck {...props} />
    <Where />
  </MemoryRouter>,
)

describe('WeekV2 — Review opens the deck', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; review.finish.mockClear(); review.reviewed = null })

  // Fix round 1 ruling: on the week's last day the one button is "Plan next
  // week", opening the deck on the week after (whose last week this is).
  it('on the week’s last day, "Plan next week" opens the deck on the week after; Leave closes it', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9))
    const deck = makeDeck()
    renderAt('/week', { deck })
    expect(screen.queryByRole('button', { name: 'Review this week' })).toBeNull()
    expect(document.querySelectorAll('.pv2-btn')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Plan next week' }))
    expect(screen.getByRole('region', { name: 'Plan this week' })).toBeTruthy()
    expect(screen.queryByText('The days')).toBeNull()
    expect(where().get('plan')).toBe('1')
    expect(where().get('date')).toBe('2026-10-04')
    expect(screen.queryByRole('button', { name: /^(Review|Plan) / })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByText('The days')).toBeTruthy()
    expect(where().get('plan')).toBeNull()
    expect(deck.onFinish).not.toHaveBeenCalled()
    expect(review.finish).not.toHaveBeenCalled()
  })

  // Calm pass 2: last week's review is the fact line's "Review", not a
  // button of its own.
  it('early in the week, last week’s review opens the deck here; finishing records it and returns to the week', async () => {
    const deck = makeDeck()
    renderAt('/week', { deck })
    expect(screen.queryByRole('button', { name: 'Review this week' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review the week of Sep 20' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(where().get('review')).toBe('1')
    expect(where().get('date')).toBeNull()
    finishPlanning()
    await vi.waitFor(() => expect(review.finish).toHaveBeenCalledWith({ wentWell: '', didnt: '' }))
    expect(deck.onFinish).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('The days')).toBeTruthy()
    expect(where().get('review')).toBeNull()
  })

  // Calm pass 2: the full deck's end is the week's planning, so it marks the
  // week planned (the record "I’m happy with this week" wrote; Home's
  // checklist reads it) — only once the drain and the review both held.
  it('finishing the full deck marks the week planned, after the drain and the review', async () => {
    session.save.mockReset(); session.save.mockResolvedValue(true)
    const order: string[] = []
    review.finish.mockImplementationOnce(async () => { order.push('review'); return true })
    session.save.mockImplementationOnce(async () => { order.push('planned'); return true })
    const deck = makeDeck({ onFinish: vi.fn(async () => { order.push('drain'); return true }) })
    renderAt('/week?plan=1', { deck })
    finishPlanning()
    await vi.waitFor(() => expect(session.save).toHaveBeenCalledTimes(1))
    expect(session.save).toHaveBeenCalledWith({ wentWell: '', didnt: '', focus: undefined })
    expect(order).toEqual(['drain', 'review', 'planned'])
    expect(await screen.findByText('The days')).toBeTruthy()
  })

  // Fix round 1 ruling: on the week's own last day, finishing the deck there
  // records last week's review but marks nothing planned (the old bar offered
  // no mark on the last day either).
  it('finishing the full deck on the current week’s last day does not mark it planned', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9)) // Saturday, the last day of Sep 27 – Oct 3
    session.save.mockReset(); review.finish.mockClear()
    renderAt('/week?review=1', { deck: makeDeck() })
    finishPlanning()
    await vi.waitFor(() => expect(review.finish).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('The days')).toBeTruthy()
    expect(session.save).not.toHaveBeenCalled()
  })

  it('a failed drain or review leaves the week unmarked; Place them never marks it', async () => {
    session.save.mockReset()
    renderAt('/week?plan=1', { deck: makeDeck({ onFinish: vi.fn(async () => false) }) })
    finishPlanning()
    await vi.waitFor(() => expect(screen.getByRole('region', { name: 'Plan this week' })).toBeTruthy())
    expect(session.save).not.toHaveBeenCalled()
    cleanup()
    review.finish.mockImplementationOnce(async () => false)
    renderAt('/week?review=1', { deck: makeDeck() })
    finishPlanning()
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
    expect(screen.queryByRole('region', { name: 'Plan this week' })).toBeNull()
    expect(screen.queryByText('Nothing left without a home')).toBeNull()
    expect(screen.queryByText('The days')).toBeNull()
  })

  it('without a deck (the v1 week) there is no review', () => {
    renderWeek()
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
  })
})

describe('WeekV2 — Plan and Place them open the deck', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; review.finish.mockClear() })

  it('Plan this week opens the full deck in place of the canvas, with no mark in the bar', () => {
    renderAt('/week', { deck: makeDeck() })
    fireEvent.click(screen.getByRole('button', { name: 'Plan this week' }))
    expect(screen.getByRole('region', { name: 'Plan this week' })).toBeTruthy()
    // Step 1: from the month.
    expect(screen.getByRole('heading', { name: 'From October' })).toBeTruthy()
    expect(screen.queryByText('The days')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I’m happy with this week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.getByText('The days')).toBeTruthy()
  })

  it('a week the deck may not open on offers neither Review nor Plan, and ignores the URL', () => {
    renderAt('/week?review=1', { deck: makeDeck({ available: false }) })
    expect(screen.queryByRole('region', { name: 'Plan this week' })).toBeNull()
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
