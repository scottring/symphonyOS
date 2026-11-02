import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import type { ChooseLineView, ChooseVerb } from '@/components/plan/choose/ChoosePlan'
import { ReadMonth } from './ReadMonth'

const verbs = (done: boolean, run = vi.fn(async () => true)): ChooseVerb[] =>
  [done ? { label: 'Reopen', role: 'reopen', run } : { label: 'Done', role: 'done', run }] as ChooseVerb[]
const line = (title: string, counts: string, steps: { title: string; label: string; kind?: string }[] = [], done = false): ChooseLineView => ({
  key: title, title, counts, planned: { kind: done ? 'done' : 'above', label: 'November' }, verbs: verbs(done),
  steps: steps.map((s) => ({ key: s.title, title: s.title, planned: { kind: (s.kind ?? 'here'), label: s.label }, verbs: verbs(s.kind === 'done'), children: [] })),
}) as unknown as ChooseLineView

describe('ReadMonth — step 3, read the month', () => {
  it('lists the month’s lines with what is planned under each, and says choosing comes at step 5', () => {
    render(<ReadMonth monthWord="November" lines={[
      line('Get the house ready', '1 done · 1 this week', [{ title: 'Clean gutters', label: 'This week · Tue', kind: 'day' }, { title: 'Order wood', label: 'Done', kind: 'done' }]),
      line('Plan the trip', ''),
    ]} doneLines={[line('Renew passports', '', [], true)]} />)
    const house = within(screen.getByRole('listitem', { name: 'Get the house ready' }))
    expect(house.getByText('1 done · 1 this week')).toBeInTheDocument()
    expect(house.getByText('Clean gutters')).toBeInTheDocument()
    expect(house.getByText('This week · Tue')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Plan the trip' })).getByText('Nothing under it yet')).toBeInTheDocument()
    // A done goal stays in sight, ticked.
    expect(screen.getByRole('checkbox', { name: 'Not done: Renew passports' })).toBeChecked()
    expect(screen.getByText(/at step 5, Choose/)).toBeInTheDocument()
  })

  it('a goal or a task already finished is ticked off with the page’s own Done (walk 2026-11-02)', async () => {
    const house = line('Get the house ready', '', [{ title: 'Clean gutters', label: 'This week' }])
    render(<ReadMonth monthWord="November" lines={[house]} doneLines={[]} />)
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Get the house ready' })) })
    expect(house.verbs[0].run).toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Clean gutters' })) })
    expect(house.steps[0].verbs[0].run).toHaveBeenCalled()
  })

  it('a tick that did not save says so on its row', async () => {
    const house = { ...line('Get the house ready', ''), verbs: verbs(false, vi.fn(async () => false)) }
    render(<ReadMonth monthWord="November" lines={[house]} doneLines={[]} />)
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Done: Get the house ready' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save')
  })

  it('a title opens its panel', () => {
    const onOpen = vi.fn()
    render(<ReadMonth monthWord="November" lines={[line('Get the house ready', '', [{ title: 'Clean gutters', label: 'This week' }])]} doneLines={[]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get the house ready' }))
    expect(onOpen).toHaveBeenCalledWith('Get the house ready')
    fireEvent.click(screen.getByRole('button', { name: 'Clean gutters' }))
    expect(onOpen).toHaveBeenCalledWith('Clean gutters')
  })

  it('an empty month says so', () => {
    render(<ReadMonth monthWord="November" lines={[]} doneLines={[]} />)
    expect(screen.getByText('Nothing on November yet.')).toBeInTheDocument()
  })
})
