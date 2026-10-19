import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ChoosePlan, type ChooseLineView, type ChoosePlanProps } from './ChoosePlan'
import { GiveThemADay } from './GiveThemADay'

const verbs = () => ({
  here: { label: 'This week', role: 'here' as const, run: vi.fn(async () => true) },
  back: { label: 'Back to October', role: 'back' as const, run: vi.fn(async () => true) },
  done: { label: 'Done', role: 'done' as const, run: vi.fn(async () => true) },
  reopen: { label: 'Reopen', role: 'reopen' as const, run: vi.fn(async () => true) },
})

const goal = (over: Partial<ChooseLineView> = {}): ChooseLineView => {
  const v = verbs()
  return {
    key: 'G', title: 'Plan a winter vacation', planned: { kind: 'above', label: 'October' }, counts: 'No steps',
    verbs: [v.here, v.done, v.reopen], steps: [], onAddStep: vi.fn(async () => true), ...over,
  }
}
const docs = (): ChooseLineView => {
  const a = verbs(), b = verbs()
  return goal({
    key: 'D', title: 'Organize important family documents', counts: '1 done · 1 this week · 1 on October',
    steps: [
      { key: 'gather', title: 'Gather everything', planned: { kind: 'done', label: 'Done' }, verbs: [verbs().reopen], children: [] },
      { key: 'inv', title: 'Inventory all documents', planned: { kind: 'day', label: 'This week · Tue' }, verbs: [a.back, a.done, a.reopen], children: [] },
      { key: 'store', title: 'Store originals securely', planned: { kind: 'above', label: 'October' }, verbs: [b.here, b.done, b.reopen], children: [], onBreakDown: vi.fn(async () => true) },
    ],
  })
}

const renderChoose = (over: Partial<ChoosePlanProps> = {}) => {
  const props: ChoosePlanProps = {
    hereWord: 'this week', aboveWord: 'October', kicker: 'October goals → this week', onLeave: vi.fn(),
    lines: [goal(), docs()],
    loose: [{ key: 'x', title: 'Return library books', planned: { kind: 'last', label: 'Last week' }, note: 'From last week, not done',
      verbs: [{ label: 'This week', role: 'here', run: vi.fn(async () => true) }], children: [] }],
    onAddLoose: vi.fn(async () => true),
    view: 'one', onViewChange: vi.fn(), primary: { label: 'Give them a day', run: vi.fn() }, ...over,
  }
  return { props, ...render(<ChoosePlan {...props} />) }
}

describe('ChoosePlan — one October goal per card', () => {
  it('says where the goal stands and offers three plain choices', () => {
    renderChoose()
    expect(screen.getByText('October goals → this week')).toBeTruthy()
    expect(screen.getByText('1 of 2')).toBeTruthy()
    const card = within(screen.getByRole('article', { name: 'Plan a winter vacation' }))
    expect(card.getByText('On October · no steps yet')).toBeTruthy()
    expect(card.getAllByRole('button').map((b) => b.textContent)).toEqual(['Do this week', 'Not this week', 'Done', '+ Add a step'])
  })

  it('Do this week saves, stamps the card and offers Undo, which sends it back', async () => {
    const g = goal()
    const back = { label: 'Back to October', role: 'back' as const, run: vi.fn(async () => true) }
    g.verbs.push(back)
    renderChoose({ lines: [g] })
    fireEvent.click(screen.getByRole('button', { name: 'Do this week: Plan a winter vacation' }))
    await waitFor(() => expect(screen.getByRole('img', { name: /this week/i })).toBeTruthy())
    expect(g.verbs[0].run).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Plan a winter vacation' }))
    await waitFor(() => expect(back.run).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Do this week: Plan a winter vacation' })).toBeTruthy()
  })

  it('Not this week changes nothing but stamps it as staying on October', async () => {
    const g = goal()
    renderChoose({ lines: [g] })
    fireEvent.click(screen.getByRole('button', { name: 'Not this week: Plan a winter vacation' }))
    await waitFor(() => expect(screen.getByText('Stays on October · no steps yet')).toBeTruthy())
    expect(screen.getByRole('img', { name: /on october/i })).toBeTruthy()
    for (const v of g.verbs) expect(v.run).not.toHaveBeenCalled()
  })

  it('a goal’s steps are on its card: done struck, one on this week stamped, the rest with their own choices', async () => {
    renderChoose()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    const steps = within(screen.getByRole('list', { name: 'Steps of Organize important family documents' }))
    expect(steps.getByText('Gather everything').closest('li')).toHaveClass('is-done')
    expect(steps.getByText('Inventory all documents').closest('li')).toHaveTextContent('On this week · Tue')
    expect(steps.getByRole('button', { name: 'Not this week: Inventory all documents' })).toBeTruthy()
    fireEvent.click(steps.getByRole('button', { name: 'Break it down: Store originals securely' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'A smaller step under Store originals securely' }), { target: { value: 'Decide: safe or box' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(docs).toBeTruthy())
  })

  it('after the last goal, what isn’t under a goal; then the way on', () => {
    const { props } = renderChoose()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    const loose = within(screen.getByRole('region', { name: 'Also this week' }))
    expect(loose.getByText('On this week, not part of an October goal.')).toBeTruthy()
    expect(loose.getByText('Return library books').closest('li')).toHaveTextContent('From last week, not done')
    fireEvent.click(screen.getByRole('button', { name: 'Give them a day' }))
    expect(props.primary.run).toHaveBeenCalled()
  })
})

describe('ChoosePlan — Also this week', () => {
  // Scott, 2026-10-19: a stamp on every row meant nothing, a passed Sunday
  // still read "On this week · Sun", and settled rows asked for a choice.
  it('only what needs a choice has buttons; what has its place folds to one line; no stamps on arrival', () => {
    const v = verbs()
    renderChoose({ lines: [], loose: [
      { key: 'm', title: 'Buy Ella a helmet', planned: { kind: 'missed', label: 'Was Sunday, not done' }, note: 'Was Sunday, not done', verbs: [v.here, v.done], children: [] },
      { key: 'd', title: 'Reschedule dentist', planned: { kind: 'day', label: 'This week · Thu' }, verbs: [verbs().done], children: [] },
      { key: 'k', title: 'Ask Kaleb about costume', planned: { kind: 'day', label: 'This week · Mon' }, verbs: [verbs().done], children: [] },
    ] })
    const loose = within(screen.getByRole('region', { name: 'Also this week' }))
    expect(loose.getByText('Buy Ella a helmet').closest('li')).toHaveTextContent('Was Sunday, not done')
    expect(loose.getByRole('button', { name: 'This week: Buy Ella a helmet' })).toBeTruthy()
    const fold = loose.getByRole('button', { name: /2 already this week/ })
    expect(fold).toHaveTextContent('Reschedule dentist (Thu) · Ask Kaleb about costume (Mon)')
    expect(loose.queryByRole('button', { name: 'Done: Reschedule dentist' })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('ChoosePlan — All at once', () => {
  it('folds each goal to a row with its counts; opening one shows the same card body', () => {
    const { props } = renderChoose({ view: 'all' })
    const row = screen.getByRole('button', { name: /Organize important family documents/ })
    expect(row).toHaveTextContent('1 done · 1 this week · 1 on October')
    fireEvent.click(row)
    expect(screen.getByRole('button', { name: 'Do this week: Organize important family documents' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'One at a time' }))
    expect(props.onViewChange).toHaveBeenCalledWith('one')
  })
})

describe('GiveThemADay', () => {
  it('tap a thing, then a day; the day is stamped and the next one waits, already chosen', async () => {
    const placeA = vi.fn(async () => true)
    const placeB = vi.fn(async () => true)
    const day = (n: number, past = false) => ({ key: `d${n}`, date: new Date(2026, 9, n), label: `Day ${n}`, isWeekend: false, past, lines: n === 20 ? ['9a Boxing'] : [], more: 0 })
    render(<GiveThemADay days={[day(19, true), day(20), day(21)]} placedCount={2} primary={{ label: 'Done planning', run: vi.fn() }}
      items={[{ key: 'a', title: 'Decide safe or box', from: 'October goal · Organize documents', onPlace: placeA }, { key: 'b', title: 'Return library books', from: 'Not under a goal', onPlace: placeB }]} />)
    expect(screen.getByText(/2 on this week with no day · 2 have one/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Day 19/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Give “Decide safe or box” Day 20' }))
    await waitFor(() => expect(placeA).toHaveBeenCalledWith(new Date(2026, 9, 20)))
    expect(screen.getByRole('img', { name: /day 20/i })).toBeTruthy()
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Return library books')
  })
})
