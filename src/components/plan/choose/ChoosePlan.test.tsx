import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ChoosePlan, type ChooseLineView, type ChoosePlanProps } from './ChoosePlan'
import { GiveThemADay } from './GiveThemADay'

const line = (over: Partial<ChooseLineView> = {}): ChooseLineView => ({
  key: 'L', title: 'Organize important family documents', planned: { kind: 'above', label: 'October' },
  counts: '1 done · 1 this week · 1 on October', verbs: [],
  steps: [
    { key: 'a', title: 'Inventory all documents', planned: { kind: 'here', label: 'This week' }, verbs: [{ label: 'Back to October', run: vi.fn(async () => true), quiet: true }], children: [] },
    { key: 'b', title: 'Store originals securely', planned: { kind: 'above', label: 'October' }, verbs: [{ label: 'This week', run: vi.fn(async () => true) }], children: [], onBreakDown: vi.fn(async () => true) },
    { key: 'c', title: 'Gather everything', planned: { kind: 'done', label: 'Done' }, verbs: [], children: [] },
  ],
  onAddStep: vi.fn(async () => true),
  ...over,
})

const renderChoose = (over: Partial<ChoosePlanProps> = {}) => {
  const props: ChoosePlanProps = {
    hereWord: 'this week', aboveWord: 'October', lines: [line(), line({ key: 'M', title: 'Plan music lessons', steps: [], counts: 'No steps' })],
    loose: [{ key: 'x', title: 'Return library books', planned: { kind: 'last', label: 'Last week' }, note: 'from last week', verbs: [{ label: 'This week', run: vi.fn(async () => true) }], children: [] }],
    onAddLoose: vi.fn(async () => true), onDropIn: vi.fn(async () => 'under “Organize important family documents”' as const),
    view: 'all', onViewChange: vi.fn(), primary: { label: 'Give them a day', run: vi.fn() }, ...over,
  }
  return { props, ...render(<ChoosePlan {...props} />) }
}

describe('ChoosePlan — All at once', () => {
  it('folds each October line to one row with its counts; opening it shows every step and what it is planned for', () => {
    renderChoose()
    expect(screen.getByRole('heading', { name: 'From October' })).toBeTruthy()
    const row = screen.getByRole('button', { name: /Organize important family documents/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveTextContent('1 done · 1 this week · 1 on October')
    expect(screen.queryByText('Inventory all documents')).toBeNull()
    fireEvent.click(row)
    const steps = within(screen.getByRole('list', { name: 'Steps of Organize important family documents' }))
    expect(steps.getByText('Inventory all documents').closest('li')).toHaveTextContent('This week')
    expect(steps.getByText('Store originals securely').closest('li')).toHaveTextContent('October')
    expect(steps.getByText('Gather everything').closest('li')).toHaveClass('is-done')
  })

  it('a step’s verb saves through the page, and a failure says so', async () => {
    const l = line()
    l.steps[1].verbs[0].run = vi.fn(async () => false)
    renderChoose({ lines: [l] })
    fireEvent.click(screen.getByRole('button', { name: /Organize important/ }))
    fireEvent.click(screen.getByRole('button', { name: 'This week: Store originals securely' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save'))
    expect(l.steps[1].verbs[0].run).toHaveBeenCalledTimes(1)
  })

  it('Break it down adds a smaller step under the step; + A step this week adds one under the line', async () => {
    const l = line()
    renderChoose({ lines: [l] })
    fireEvent.click(screen.getByRole('button', { name: /Organize important/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Break it down: Store originals securely' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'A smaller step under Store originals securely' }), { target: { value: 'Decide: safe or deposit box' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(l.steps[1].onBreakDown).toHaveBeenCalledWith('Decide: safe or deposit box'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a step this week under Organize important family documents' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'A step this week under Organize important family documents' }), { target: { value: 'Call county records' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(l.onAddStep).toHaveBeenCalledWith('Call county records'))
  })

  it('Not under a line holds last week’s leftovers; Drop something in says where it went', async () => {
    const { props } = renderChoose()
    const loose = within(screen.getByRole('region', { name: 'Not under a line' }))
    expect(loose.getByText('Return library books').closest('li')).toHaveTextContent('from last week')
    fireEvent.change(screen.getByRole('textbox', { name: 'Drop something in' }), { target: { value: 'Call county records' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Drop something in' }))
    await waitFor(() => expect(screen.getByText('Added under “Organize important family documents”')).toBeTruthy())
    expect(props.onDropIn).toHaveBeenCalledWith('Call county records')
  })
})

describe('ChoosePlan — One at a time', () => {
  it('shows one line per card, then Not under a line; the switch reports the choice', () => {
    const { props } = renderChoose({ view: 'one' })
    expect(screen.getByRole('heading', { name: 'Organize important family documents' })).toBeTruthy()
    expect(screen.getByText('Inventory all documents')).toBeTruthy()
    expect(screen.getByText('1 of 2 October lines')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next line' }))
    expect(screen.getByRole('heading', { name: 'Plan music lessons' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not under a line' }))
    expect(screen.getByText('Return library books')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'All at once' }))
    expect(props.onViewChange).toHaveBeenCalledWith('all')
  })
})

describe('GiveThemADay', () => {
  it('tap a thing, then a day; the next one waits, already chosen', async () => {
    const placeA = vi.fn(async () => true)
    const placeB = vi.fn(async () => true)
    const day = (n: number, past = false) => ({ key: `d${n}`, date: new Date(2026, 9, n), label: `Day ${n}`, isWeekend: false, past, lines: n === 20 ? ['9a Boxing'] : [], more: 0 })
    render(<GiveThemADay days={[day(19, true), day(20), day(21)]} placedCount={2} primary={{ label: 'Done planning', run: vi.fn() }}
      items={[{ key: 'a', title: 'Decide safe or box', from: 'October · Organize documents', onPlace: placeA }, { key: 'b', title: 'Return library books', from: 'Not under a line', onPlace: placeB }]} />)
    expect(screen.getByText('4 on this week · 2 have a day')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Day 19/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Give “Decide safe or box” Day 20' }))
    await waitFor(() => expect(placeA).toHaveBeenCalledWith(new Date(2026, 9, 20)))
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Return library books')
  })
})
