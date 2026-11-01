import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ChooseLineView } from '@/components/plan/choose/ChoosePlan'
import { ReadMonth } from './ReadMonth'

const line = (title: string, counts: string, steps: { title: string; label: string; kind?: string }[] = []): ChooseLineView => ({
  key: title, title, counts, planned: { kind: 'above', label: 'November' }, verbs: [],
  steps: steps.map((s) => ({ key: s.title, title: s.title, planned: { kind: (s.kind ?? 'here'), label: s.label }, verbs: [], children: [] })),
}) as unknown as ChooseLineView

describe('ReadMonth — step 2, read the month', () => {
  it('lists the month’s lines with what is planned under each, and nothing to press', () => {
    render(<ReadMonth monthWord="November" lines={[
      line('Get the house ready', '1 done · 1 this week', [{ title: 'Clean gutters', label: 'This week · Tue', kind: 'day' }, { title: 'Order wood', label: 'Done', kind: 'done' }]),
      line('Plan the trip', ''),
    ]} doneLines={[line('Renew passports', '')]} />)
    const house = within(screen.getByRole('listitem', { name: 'Get the house ready' }))
    expect(house.getByText('1 done · 1 this week')).toBeInTheDocument()
    expect(house.getByText('Clean gutters')).toBeInTheDocument()
    expect(house.getByText('This week · Tue')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Plan the trip' })).getByText('Nothing under it yet')).toBeInTheDocument()
    expect(screen.getByText('1 done on November')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('an empty month says so', () => {
    render(<ReadMonth monthWord="November" lines={[]} doneLines={[]} />)
    expect(screen.getByText('Nothing on November yet.')).toBeInTheDocument()
  })
})
