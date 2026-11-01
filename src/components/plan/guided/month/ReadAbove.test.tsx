import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ChooseLineView } from '@/components/plan/choose/ChoosePlan'
import { ReadAbove } from './ReadAbove'

const line = (title: string, counts: string, steps: { title: string; label: string; kind?: string }[] = []): ChooseLineView => ({
  key: title, title, counts, planned: { kind: 'above', label: 'Fall' }, verbs: [],
  steps: steps.map((s) => ({ key: s.title, title: s.title, planned: { kind: (s.kind ?? 'here'), label: s.label }, verbs: [], children: [] })),
}) as unknown as ChooseLineView

describe('ReadAbove — read the level above (Month: the season list)', () => {
  it('lists each season goal with how far it has come, and nothing to press', () => {
    render(<ReadAbove aboveWord="Fall" lines={[
      line('Get the house ready', '1 done · 1 in November · 2 on Fall', [{ title: 'Clean gutters', label: 'November' }, { title: 'Order wood', label: 'Done', kind: 'done' }]),
      line('Get outside', ''),
    ]} doneLines={[line('Renew passports', '')]} />)
    expect(screen.getByRole('list', { name: 'Fall goals' })).toBeInTheDocument()
    const house = within(screen.getByRole('listitem', { name: 'Get the house ready' }))
    expect(house.getByText('1 done · 1 in November · 2 on Fall')).toBeInTheDocument()
    expect(house.getByText('Order wood').closest('li')).toHaveClass('is-done')
    expect(within(screen.getByRole('listitem', { name: 'Get outside' })).getByText('Nothing under it yet')).toBeInTheDocument()
    expect(screen.getByText('1 done on Fall')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('an empty season says so; one all done says that', () => {
    const { unmount } = render(<ReadAbove aboveWord="Fall" lines={[]} doneLines={[]} />)
    expect(screen.getByText('Nothing on Fall yet.')).toBeInTheDocument()
    unmount()
    render(<ReadAbove aboveWord="Fall" lines={[]} doneLines={[line('Renew passports', '')]} />)
    expect(screen.getByText('Every Fall goal is done.')).toBeInTheDocument()
  })
})
