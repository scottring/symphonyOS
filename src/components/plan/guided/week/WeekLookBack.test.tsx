import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { WeekLookBack, type LooseEnd } from './WeekLookBack'
import type { FamilyMember } from '@/types/family'

const member = (id: string, name: string) => ({ id, name, initials: name[0], color: 'blue' }) as unknown as FamilyMember
const iris = member('iris', 'Iris')

const end = (title: string, over: Partial<LooseEnd> = {}): LooseEnd => ({
  key: title, title, note: 'Not done', who: [],
  thisWeek: vi.fn(async () => true), smaller: vi.fn(async () => true), handOff: vi.fn(async () => true),
  drop: vi.fn(async () => true), done: vi.fn(async () => true),
  ...over,
})
const review = () => ({ mine: null, reviewed: null, loading: false, finish: vi.fn(async () => true) })
const setup = (over: Partial<Parameters<typeof WeekLookBack>[0]> = {}) => {
  const props = { review: review(), done: 3, outOf: 5, notDone: 2, looseEnds: [end('Fix the gate'), end('Call the bank')], members: [iris], aged: 0, onSeeAged: vi.fn(), ...over }
  render(<WeekLookBack {...props} />)
  return props
}
const row = (title: string) => within(screen.getByRole('listitem', { name: title }))

describe('WeekLookBack — step 1, look back at last week', () => {
  it('saving the two notes records last week’s review', async () => {
    const p = setup()
    expect(screen.getByText(/of 5 done · 2 not done/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What went well'), { target: { value: 'Shipped the deck' } })
    fireEvent.change(screen.getByLabelText('What didn’t'), { target: { value: 'Too many evenings out' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save notes' })) })
    expect(p.review.finish).toHaveBeenCalledWith({ wentWell: 'Shipped the deck', didnt: 'Too many evenings out' })
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })

  it('opens on what was already said', () => {
    setup({ review: { ...review(), mine: { wentWell: 'Rested', didnt: '' } } })
    expect(screen.getByLabelText('What went well')).toHaveValue('Rested')
  })

  it('each loose end offers This week, Smaller, Hand off and Drop, and each runs its own write', async () => {
    const p = setup()
    for (const t of ['Fix the gate', 'Call the bank']) {
      for (const v of ['This week', 'Smaller', 'Hand off', 'Drop']) expect(row(t).getByRole('button', { name: `${v}: ${t}` })).toBeInTheDocument()
    }
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'This week: Fix the gate' })) })
    expect(p.looseEnds[0].thisWeek).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(row('Call the bank').getByRole('button', { name: 'Drop: Call the bank' })) })
    expect(p.looseEnds[1].drop).toHaveBeenCalledTimes(1)
    expect(p.looseEnds[0].drop).not.toHaveBeenCalled()
  })

  it('Smaller opens the break-down line and adds a step under it', async () => {
    const p = setup()
    fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Smaller: Fix the gate' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'A smaller step under Fix the gate' }), { target: { value: 'Buy a hinge' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    expect(p.looseEnds[0].smaller).toHaveBeenCalledWith('Buy a hinge')
  })

  it('Hand off lists the household; a name hands it to them', async () => {
    const p = setup()
    fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Hand off: Fix the gate' }))
    await act(async () => { fireEvent.click(row('Fix the gate').getByRole('button', { name: 'Iris' })) })
    expect(p.looseEnds[0].handOff).toHaveBeenCalledWith(iris)
  })

  it('a write that did not save says so on its row', async () => {
    setup({ looseEnds: [end('Fix the gate', { drop: vi.fn(async () => false) })] })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Drop: Fix the gate' })) })
    expect(row('Fix the gate').getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('with no one to hand to, Hand off is not offered', () => {
    setup({ members: [] })
    expect(screen.queryByRole('button', { name: 'Hand off: Fix the gate' })).toBeNull()
  })

  it('says what the opening sweep moved to Later, with a way to see them', () => {
    const p = setup({ aged: 2 })
    expect(screen.getByText(/Moved 2 untouched things to Later/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See them' }))
    expect(p.onSeeAged).toHaveBeenCalled()
  })

  it('nothing left open says so', () => {
    setup({ looseEnds: [], notDone: 0 })
    expect(screen.getByText('Nothing left open from last week.')).toBeInTheDocument()
  })
})
