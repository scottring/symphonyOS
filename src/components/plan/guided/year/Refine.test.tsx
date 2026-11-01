import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { useState } from 'react'
import { Refine } from './Refine'

const GOALS = [{ id: 'a', title: 'Run a 10k' }, { id: 'w', title: 'Redo the will' }, { id: 'b', title: 'Run a half marathon' }]
type Props = Parameters<typeof Refine>[0]
// "Keep both" is remembered by the session (the page); here, a stand-in.
function WithKept(p: Omit<Props, 'kept' | 'onKeepBoth'>) {
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set())
  return <Refine {...p} kept={kept} onKeepBoth={(k) => setKept((s) => new Set([...s, k]))} />
}
const setup = (goals = GOALS) => {
  const p = { goals, onLetGo: vi.fn(async () => true), onSomeday: vi.fn(async () => true) }
  render(<WithKept {...p} />)
  return p
}
const pair = () => within(screen.getByRole('listitem', { name: 'Run a 10k and Run a half marathon' }))

describe('Refine — goals that may overlap, and Scott’s call on each pair', () => {
  it('shows the pairs that overlap, with three calls; nothing merges on its own', () => {
    setup()
    expect(within(screen.getByRole('list', { name: 'May overlap' })).getAllByRole('listitem')).toHaveLength(1)
    expect(pair().getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep both', 'Let go of one', 'Someday'])
  })

  it('Keep both sets the pair aside for this session, writing nothing', () => {
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
    expect(which.getAllByRole('button').map((b) => b.textContent)).toEqual(['Run a 10k', 'Run a half marathon', 'Cancel'])
    await act(async () => { fireEvent.click(which.getByRole('button', { name: 'Run a half marathon' })) })
    expect(p.onLetGo).toHaveBeenCalledWith({ id: 'b', title: 'Run a half marathon' })
    expect(p.onSomeday).not.toHaveBeenCalled()
  })

  it('Someday asks which, and Cancel goes back without writing', async () => {
    const p = setup()
    fireEvent.click(pair().getByRole('button', { name: 'Someday' }))
    fireEvent.click(within(pair().getByRole('group', { name: 'Someday: which?' })).getByRole('button', { name: 'Cancel' }))
    expect(pair().getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep both', 'Let go of one', 'Someday'])
    fireEvent.click(pair().getByRole('button', { name: 'Someday' }))
    await act(async () => { fireEvent.click(within(pair().getByRole('group', { name: 'Someday: which?' })).getByRole('button', { name: 'Run a 10k' })) })
    expect(p.onSomeday).toHaveBeenCalledWith({ id: 'a', title: 'Run a 10k' })
    expect(p.onLetGo).not.toHaveBeenCalled()
  })

  it('says when a call did not save', async () => {
    const p = setup()
    p.onLetGo.mockResolvedValueOnce(false)
    fireEvent.click(pair().getByRole('button', { name: 'Let go of one' }))
    await act(async () => { fireEvent.click(pair().getByRole('button', { name: 'Run a 10k' })) })
    expect(pair().getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })

  it('says so when nothing looks alike', () => {
    setup([{ id: 'x', title: 'Max the 401k' }, { id: 'w', title: 'Redo the will' }])
    expect(screen.getByText('Nothing on the list looks alike.')).toBeInTheDocument()
  })
})
