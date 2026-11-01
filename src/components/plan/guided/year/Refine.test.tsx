import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { useState } from 'react'
import { Refine, YearRefine } from './Refine'

const GOALS = [{ id: 'a', title: 'Family trip to Maine' }, { id: 'w', title: 'Redo the will' }, { id: 'b', title: 'Maine family trip' }]
type Props = Parameters<typeof Refine>[0]
// "Keep both" is kept in the year's notes (YearRefine); here, a stand-in.
function WithKept(p: Omit<Props, 'kept' | 'onKeepBoth'>) {
  const [kept, setKept] = useState<[string, string][]>([])
  return <Refine {...p} kept={kept} onKeepBoth={(pair) => setKept((k) => [...k, pair])} />
}
const setup = (goals = GOALS) => {
  const p = { goals, onLetGo: vi.fn(async () => true), onSomeday: vi.fn(async () => true) }
  render(<WithKept {...p} />)
  return p
}
const PAIR = 'Family trip to Maine and Maine family trip'
const pair = () => within(screen.getByRole('listitem', { name: PAIR }))

describe('Refine — goals that may overlap, and Scott’s call on each pair', () => {
  it('shows the pairs that overlap, with three calls; nothing merges on its own', () => {
    setup()
    expect(within(screen.getByRole('list', { name: 'May overlap' })).getAllByRole('listitem')).toHaveLength(1)
    expect(pair().getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep both', 'Let go of one', 'Someday'])
  })

  it('Keep both sets the pair aside, writing no goal', () => {
    const p = setup()
    fireEvent.click(pair().getByRole('button', { name: 'Keep both' }))
    expect(screen.queryByRole('list', { name: 'May overlap' })).toBeNull()
    expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
    expect(p.onLetGo).not.toHaveBeenCalled()
    expect(p.onSomeday).not.toHaveBeenCalled()
  })

  it('Let go of one asks which, then lets go of that one only', async () => {
    const p = setup()
    fireEvent.click(pair().getByRole('button', { name: 'Let go of one' }))
    expect(p.onLetGo).not.toHaveBeenCalled()
    const which = within(pair().getByRole('group', { name: 'Let go of which?' }))
    expect(which.getAllByRole('button').map((b) => b.textContent)).toEqual(['Family trip to Maine', 'Maine family trip', 'Cancel'])
    await act(async () => { fireEvent.click(which.getByRole('button', { name: 'Maine family trip' })) })
    expect(p.onLetGo).toHaveBeenCalledWith({ id: 'b', title: 'Maine family trip' })
    expect(p.onSomeday).not.toHaveBeenCalled()
  })

  it('Someday asks which, and Cancel goes back without writing', async () => {
    const p = setup()
    fireEvent.click(pair().getByRole('button', { name: 'Someday' }))
    fireEvent.click(within(pair().getByRole('group', { name: 'Someday: which?' })).getByRole('button', { name: 'Cancel' }))
    expect(pair().getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep both', 'Let go of one', 'Someday'])
    fireEvent.click(pair().getByRole('button', { name: 'Someday' }))
    await act(async () => { fireEvent.click(within(pair().getByRole('group', { name: 'Someday: which?' })).getByRole('button', { name: 'Family trip to Maine' })) })
    expect(p.onSomeday).toHaveBeenCalledWith({ id: 'a', title: 'Family trip to Maine' })
    expect(p.onLetGo).not.toHaveBeenCalled()
  })

  it('says when a call did not save', async () => {
    const p = setup()
    p.onLetGo.mockResolvedValueOnce(false)
    fireEvent.click(pair().getByRole('button', { name: 'Let go of one' }))
    await act(async () => { fireEvent.click(pair().getByRole('button', { name: 'Family trip to Maine' })) })
    expect(pair().getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('says so when nothing looks alike', () => {
    setup([{ id: 'x', title: 'Max the 401k' }, { id: 'w', title: 'Redo the will' }])
    expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
  })
})

describe('YearRefine — Keep both, kept in the year’s notes', () => {
  const MORE = [...GOALS, { id: 'c', title: 'Get fit' }, { id: 'd', title: 'Get fit this year' }]
  const props = (patch: (p: Record<string, unknown>) => Promise<boolean>, value?: [string, string][]) =>
    ({ goals: MORE, value, patch, onLetGo: vi.fn(async () => true), onSomeday: vi.fn(async () => true) })

  it('a pair kept in an earlier session stays set aside', () => {
    render(<YearRefine {...props(vi.fn(async () => true), [['a', 'b']])} />)
    expect(screen.queryByRole('listitem', { name: PAIR })).toBeNull()
    expect(screen.getByRole('listitem', { name: 'Get fit and Get fit this year' })).toBeInTheDocument()
  })

  it('Keep both saves the pair; a second one builds on the first before it lands', async () => {
    const patch = vi.fn(() => new Promise<boolean>(() => {}))
    render(<YearRefine {...props(patch, [])} />)
    fireEvent.click(within(screen.getByRole('listitem', { name: PAIR })).getByRole('button', { name: 'Keep both' }))
    fireEvent.click(within(screen.getByRole('listitem', { name: 'Get fit and Get fit this year' })).getByRole('button', { name: 'Keep both' }))
    expect(patch.mock.calls.map((c) => (c as unknown[])[0])).toEqual([{ keptPairs: [['a', 'b']] }, { keptPairs: [['a', 'b'], ['c', 'd']] }])
    expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
  })

  it('a Keep both that did not save can be sent again', async () => {
    const patch = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<YearRefine {...props(patch)} />)
    await act(async () => { fireEvent.click(within(screen.getByRole('listitem', { name: PAIR })).getByRole('button', { name: 'Keep both' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save.')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
    expect(patch.mock.calls[1][0]).toEqual({ keptPairs: [['a', 'b']] })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
