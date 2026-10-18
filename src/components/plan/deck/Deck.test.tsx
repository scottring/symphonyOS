import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockTask } from '@/test/mocks/factories'
import type { DeckCard } from '@/lib/planning/deck'
import type { DeckActions } from '@/components/home/week/useDeckActions'
import { Deck } from './Deck'
import { WeekStrip, type StripDay } from './WeekStrip'

const card = (id: string, over: Partial<DeckCard> = {}): DeckCard => ({
  key: id,
  task: createMockTask({ id, title: `Task ${id}` }),
  source: 'this-week',
  facts: 'On this week · no day yet',
  ...over,
})
const cardsOf = (n: number) => Array.from({ length: n }, (_, i) => card(`c${i + 1}`))

const mockActions = (result = true): DeckActions => ({
  done: vi.fn(async () => result),
  placeOnDay: vi.fn(async () => result),
  keepThisWeek: vi.fn(async () => result),
  later: vi.fn(async () => result),
  laterOnDate: vi.fn(async () => result),
  letGo: vi.fn(async () => result),
  drain: vi.fn(async () => result),
})

const SAT = new Date(2026, 9, 24)
const stripDays: StripDay[] = Array.from({ length: 7 }, (_, i) => {
  const date = new Date(2026, 9, 24 + i)
  return {
    key: `d${i}`,
    date,
    label: `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.getDate()}`,
    isWeekend: i < 2,
    lines: i === 0 ? ['Soccer, 9:30', 'Groceries', 'Birthday party'] : [],
    more: i === 0 ? 2 : 0,
  }
})

type Props = Parameters<typeof Deck>[0]
const setup = (over: Partial<Props> = {}) => {
  const props: Props = {
    cards: cardsOf(3),
    doneLastWeek: 9,
    aged: 0,
    onSeeAged: vi.fn(),
    actions: mockActions(),
    stripDays,
    mode: 'place',
    onFinish: vi.fn(),
    onExit: vi.fn(),
    ...over,
  }
  const view = render(<Deck {...props} />)
  return { props, ...view, rerender: (next: Partial<Props>) => view.rerender(<Deck {...props} {...next} />) }
}

/** Let the action's promise settle, then hold the stamp for its ~850ms. */
const settle = async () => { await act(async () => {}) }
const hold = () => act(() => { vi.advanceTimersByTime(850) })
const title = () => screen.getByRole('heading', { level: 2 }).textContent
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const decide = async () => { tap('Done'); await settle(); hold() }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('Deck intro', () => {
  it('shows the intro copy in full mode, and deals on tap', () => {
    setup({ mode: 'full' })
    expect(screen.getByRole('heading', { name: 'Where things go' })).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === '9 done last week' && el.tagName === 'P')).toBeInTheDocument()
    expect(screen.getByText('Everything without a home this week, one card at a time, closest first.')).toBeInTheDocument()
    expect(screen.queryByText(/older things, untouched/)).toBeNull()
    tap('Deal the first hand')
    expect(title()).toBe('Task c1')
  })

  it('shows the aged line only when aged > 0, and See them calls onSeeAged', () => {
    const { props } = setup({ mode: 'full', aged: 4 })
    expect(screen.getByText(/4 older things, untouched for 3\+ weeks, already went to Later on their own ·/)).toBeInTheDocument()
    tap('See them')
    expect(props.onSeeAged).toHaveBeenCalledTimes(1)
  })

  it('place mode shows the first card at once', () => {
    setup({ mode: 'place' })
    expect(screen.queryByText('Where things go')).toBeNull()
    expect(title()).toBe('Task c1')
  })
})

describe('One card at a time', () => {
  it('shows the source pill, serves line, title, facts and the four choices, with nothing revealed', () => {
    setup({ cards: [card('a', { source: 'last-week', facts: 'Not done · carried 2 weeks', serves: 'For October · Get the house ready for winter' })] })
    expect(screen.getByText('Last week')).toBeInTheDocument()
    expect(screen.getByText('For October · Get the house ready for winter')).toBeInTheDocument()
    expect(title()).toBe('Task a')
    expect(screen.getByText('Not done · carried 2 weeks')).toBeInTheDocument()
    const choices = within(screen.getByRole('group', { name: 'Where it goes' })).getAllByRole('button').map((b) => b.textContent)
    expect(choices).toEqual(['Done', 'This week', 'Later', 'Let go'])
    expect(screen.queryByText("Tap a day · what's already there is shown")).toBeNull()
    expect(screen.queryByText('When')).toBeNull()
  })

  it('omits the serves line when there is none', () => {
    setup({ cards: [card('a', { source: 'inbox', facts: 'Captured Tuesday' })] })
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.queryByText(/^For /)).toBeNull()
  })
})

describe('Reveals', () => {
  it('This week opens the strip; a tile places the card on that day', async () => {
    const { props } = setup()
    tap('This week')
    expect(screen.getByText("Tap a day · what's already there is shown")).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^(Sat|Sun|Mon|Tue|Wed|Thu|Fri) \d+/ })).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: /^Sat 24/ }))
    await settle()
    expect(props.actions.placeOnDay).toHaveBeenCalledWith(props.cards[0], SAT)
    expect(screen.getByRole('img', { name: 'carried — sat' })).toBeInTheDocument()
  })

  it('This week, no day yet keeps it this week', async () => {
    const { props } = setup()
    tap('This week')
    tap('This week, no day yet')
    await settle()
    expect(props.actions.keepThisWeek).toHaveBeenCalledWith(props.cards[0])
    expect(screen.getByRole('img', { name: 'carried — this week' })).toBeInTheDocument()
  })

  it('Later opens the six choices; each Later choice moves it with a LATER stamp', async () => {
    const { props } = setup()
    tap('Later')
    expect(screen.getByText('When')).toBeInTheDocument()
    for (const name of ['Next week', 'This month', 'Next month', 'This season', 'Someday']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Pick a date…')).toHaveAttribute('type', 'date')
    tap('Next month')
    await settle()
    expect(props.actions.later).toHaveBeenCalledWith(props.cards[0], 'next-month')
    expect(screen.getByRole('img', { name: 'later — next month' })).toBeInTheDocument()
  })

  it('Pick a date… calls laterOnDate with the local date', async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 15))
    const { props } = setup()
    tap('Later')
    expect(screen.getByLabelText('Pick a date…')).toHaveAttribute('min', '2026-10-18')
    fireEvent.change(screen.getByLabelText('Pick a date…'), { target: { value: '2026-11-03' } })
    await settle()
    expect(props.actions.laterOnDate).toHaveBeenCalledWith(props.cards[0], new Date(2026, 10, 3))
    expect(screen.getByRole('img', { name: /^later — / })).toBeInTheDocument()
  })

  it('Done and Let go stamp DONE and LET GO', async () => {
    const { props } = setup()
    tap('Done')
    await settle()
    expect(props.actions.done).toHaveBeenCalledWith(props.cards[0])
    expect(screen.getByRole('img', { name: 'done — done' })).toHaveClass('is-fresh')
    hold()
    tap('Let go')
    await settle()
    expect(props.actions.letGo).toHaveBeenCalledWith(props.cards[1])
    expect(screen.getByRole('img', { name: 'let go — let go' })).toBeInTheDocument()
  })

  it('Pick a date… ignores partial, impossible and past values; today is allowed', async () => {
    vi.setSystemTime(new Date(2026, 9, 18, 15))
    const { props } = setup()
    tap('Later')
    const input = screen.getByLabelText('Pick a date…')
    for (const value of ['0002-11-03', '2026-02-31', '2026-10-17', '']) {
      fireEvent.change(input, { target: { value } })
      await settle()
    }
    expect(props.actions.laterOnDate).not.toHaveBeenCalled()
    expect(screen.queryByRole('img')).toBeNull()
    fireEvent.change(input, { target: { value: '2026-10-18' } })
    await settle()
    expect(props.actions.laterOnDate).toHaveBeenCalledWith(props.cards[0], new Date(2026, 9, 18))
  })
})

describe('After a choice', () => {
  it('holds the stamped card for about 850ms, then deals the next', async () => {
    setup()
    tap('Done')
    await settle()
    expect(title()).toBe('Task c1')
    act(() => { vi.advanceTimersByTime(700) })
    expect(title()).toBe('Task c1')
    act(() => { vi.advanceTimersByTime(150) })
    expect(title()).toBe('Task c2')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('holds the card while its optimistic save is in flight', async () => {
    const cards = cardsOf(3)
    let resolve!: (ok: boolean) => void
    const actions = { ...mockActions(), done: vi.fn(() => new Promise<boolean>((r) => { resolve = r })) }
    const { rerender } = setup({ cards, actions })
    tap('Done')
    // The writer marks the task completed before the save settles.
    rerender({ cards: [{ ...cards[0], task: { ...cards[0].task, completed: true } }, cards[1], cards[2]], actions })
    expect(title()).toBe('Task c1')
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    await act(async () => { resolve(true) })
    expect(title()).toBe('Task c1')
    expect(screen.getByRole('img', { name: 'done — done' })).toBeInTheDocument()
    hold()
    expect(title()).toBe('Task c2')
  })

  it('the last card never flashes the empty screen mid-save', async () => {
    const cards = cardsOf(1)
    let resolve!: (ok: boolean) => void
    const actions = { ...mockActions(), done: vi.fn(() => new Promise<boolean>((r) => { resolve = r })) }
    const { rerender } = setup({ cards, actions })
    tap('Done')
    rerender({ cards: [{ ...cards[0], task: { ...cards[0].task, completed: true } }], actions })
    expect(screen.queryByText('Nothing left without a home')).toBeNull()
    expect(title()).toBe('Task c1')
    await act(async () => { resolve(true) })
    expect(screen.queryByText('Nothing left without a home')).toBeNull()
    hold()
    expect(screen.getByRole('heading', { name: 'Nothing left without a home' })).toBeInTheDocument()
  })

  it('a failed optimistic save that rolls back keeps the card', async () => {
    const cards = cardsOf(2)
    let resolve!: (ok: boolean) => void
    const actions = { ...mockActions(), done: vi.fn(() => new Promise<boolean>((r) => { resolve = r })) }
    const { rerender } = setup({ cards, actions })
    tap('Done')
    rerender({ cards: [{ ...cards[0], task: { ...cards[0].task, completed: true } }, cards[1]], actions })
    rerender({ cards, actions }) // rolled back
    await act(async () => { resolve(false) })
    hold()
    expect(title()).toBe('Task c1')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('a failed save neither stamps nor advances', async () => {
    setup({ actions: mockActions(false) })
    tap('Done')
    await settle()
    hold()
    expect(screen.queryByRole('img')).toBeNull()
    expect(title()).toBe('Task c1')
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
  })

  it('ignores a second tap while the first is saving', async () => {
    const { props } = setup()
    tap('Done')
    tap('Let go')
    await settle()
    expect(props.actions.done).toHaveBeenCalledTimes(1)
    expect(props.actions.letGo).not.toHaveBeenCalled()
  })
})

describe('Counter and hands', () => {
  it('with 3 cards the counter reads 1 of 3', () => {
    setup({ cards: cardsOf(3) })
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('counts the hand, not the pile', async () => {
    setup({ cards: cardsOf(12) })
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
    await decide()
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
  })

  it('with 7 cards the hand end offers Deal 2 more, which deals a hand of 2', async () => {
    setup({ cards: cardsOf(7) })
    for (let i = 0; i < 5; i++) await decide()
    expect(screen.getByRole('heading', { name: "That's a hand" })).toBeInTheDocument()
    expect(screen.getByText('Stop here and anything left from last week goes to Later. The Inbox keeps its own.')).toBeInTheDocument()
    tap('Deal 2 more')
    expect(title()).toBe('Task c6')
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
  })

  it('a short last hand: 8 cards → Deal 3 more → 1 of 3', async () => {
    setup({ cards: cardsOf(8) })
    for (let i = 0; i < 5; i++) await decide()
    tap('Deal 3 more')
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it("That's enough for this week calls onFinish with the decided keys", async () => {
    const { props } = setup({ cards: cardsOf(7) })
    for (let i = 0; i < 5; i++) await decide()
    tap("That's enough for this week")
    expect(props.onFinish).toHaveBeenCalledTimes(1)
    expect([...(props.onFinish as ReturnType<typeof vi.fn>).mock.calls[0][0]]).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
  })

  it('Leave calls onExit', () => {
    const { props } = setup()
    tap('Leave')
    expect(props.onExit).toHaveBeenCalledTimes(1)
  })
})

describe('Stale cards', () => {
  it('skips a card whose task became completed between renders', () => {
    const cards = cardsOf(3)
    const { rerender } = setup({ cards })
    expect(title()).toBe('Task c1')
    rerender({ cards: [{ ...cards[0], task: { ...cards[0].task, completed: true } }, cards[1], cards[2]] })
    expect(title()).toBe('Task c2')
  })

  it('keeps the stamped card through its hold even once its task reads completed', async () => {
    const cards = cardsOf(3)
    const { rerender } = setup({ cards })
    tap('Done')
    await settle()
    rerender({ cards: [{ ...cards[0], task: { ...cards[0].task, completed: true } }, cards[1], cards[2]] })
    expect(title()).toBe('Task c1')
    expect(screen.getByRole('img', { name: 'done — done' })).toBeInTheDocument()
    hold()
    expect(title()).toBe('Task c2')
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('does not deal a decided card again when the parent still passes it', async () => {
    const cards = cardsOf(3)
    const { rerender } = setup({ cards })
    await decide()
    rerender({ cards: [...cards] })
    expect(title()).toBe('Task c2')
  })

  it('skips a completed card when dealing', () => {
    const cards = cardsOf(2)
    setup({ cards: [{ ...cards[0], task: { ...cards[0].task, completed: true } }, cards[1]] })
    expect(title()).toBe('Task c2')
    expect(screen.getByText('1 of 1')).toBeInTheDocument()
  })
})

describe('Empty deck', () => {
  it('full mode with no cards goes straight to the empty screen', () => {
    const { props } = setup({ mode: 'full', cards: [] })
    expect(screen.getByRole('heading', { name: 'Nothing left without a home' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deal the first hand' })).toBeNull()
    tap('Back to the week')
    expect(props.onFinish).toHaveBeenCalledTimes(1)
  })

  it('shows the empty screen once the last card is decided', async () => {
    setup({ cards: cardsOf(2) })
    await decide()
    await decide()
    expect(screen.getByRole('heading', { name: 'Nothing left without a home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to the week' })).toBeInTheDocument()
  })
})

describe('WeekStrip', () => {
  it('shows +more from `more` alone, and never more than 3 lines', () => {
    const days = stripDays.map((d, i) => (i === 0 ? { ...d, lines: ['a', 'b', 'c', 'd'], more: 1 } : d))
    render(<WeekStrip days={days} onPick={vi.fn()} onNoDay={vi.fn()} />)
    const sat = screen.getByRole('button', { name: /^Sat 24/ })
    expect(within(sat).queryByText('d')).toBeNull()
    expect(within(sat).getByText('+1 more')).toBeInTheDocument()
  })

  it('shows seven tiles, at most 3 lines each, then +more', () => {
    const onPick = vi.fn()
    const onNoDay = vi.fn()
    render(<WeekStrip days={stripDays} onPick={onPick} onNoDay={onNoDay} />)
    const sat = screen.getByRole('button', { name: /^Sat 24/ })
    expect(within(sat).getByText('Soccer, 9:30')).toBeInTheDocument()
    expect(within(sat).getByText('Birthday party')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^(Sat|Sun|Mon|Tue|Wed|Thu|Fri) \d+/ })).toHaveLength(7)
    expect(within(sat).getByText('+2 more')).toBeInTheDocument()
    fireEvent.click(sat)
    expect(onPick).toHaveBeenCalledWith(SAT)
    fireEvent.click(screen.getByRole('button', { name: 'This week, no day yet' }))
    expect(onNoDay).toHaveBeenCalledTimes(1)
  })
})
