import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { Choice, ChoiceOption, PriceLine, CellValue } from '@/types/choice'
import type { ChoiceDetail } from '@/lib/choices/db'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

import { ChoicePageView } from './ChoicePage'

const now = new Date()
const choice: Choice = {
  id: 'c1', userId: 'u', goal: { kind: 'task', id: 'g1' }, title: 'Contractor', status: 'open',
  decidedWork: [], sortOrder: 0, createdAt: now, updatedAt: now,
  columns: [
    { id: 'start', label: 'Earliest start', kind: 'date' },
    { id: 'ins', label: 'Insured', kind: 'yesno' },
    { id: 'ref', label: 'References', kind: 'text' },
  ],
  work: [
    { id: 'main', label: 'Main bath', description: 'Gut it.' },
    { id: 'hall', label: 'Hall bath', description: 'New vanity.' },
    { id: 'kids', label: "Kids' bath", description: 'Tile only.' },
  ],
  selectedWork: ['main', 'hall'],
}
const opt = (id: string, name: string, order: number, o: Partial<ChoiceOption> = {}, values: Record<string, CellValue> = {}): ChoiceOption => ({
  id, choiceId: 'c1', userId: 'u', name, status: 'heard_back', statusChangedAt: new Date(2026, 9, 18),
  values, sortOrder: order, updatedAt: now, ...o,
})
const line = (id: string, optionId: string, workIds: string[], amountCents: number): PriceLine =>
  ({ id, optionId, workIds, amountCents, sortOrder: 0 })

const detail: ChoiceDetail = {
  choice, goalTitle: 'Redo the bathrooms', goalContext: null, goalScope: 'season',
  options: [
    opt('mar', 'Martinez Tile & Bath', 1, { contactId: 'k1' }, { start: '2026-11-17', ins: true, ref: 'Called two, both happy' }),
    opt('har', 'Harbor Bath Remodeling', 2, {}, { start: '2027-01-05', ins: true }),
    opt('che', 'Chesapeake Renovations', 3, {}, { start: '2026-12-01', ins: true }),
    opt('rob', "Rob (Dave's cousin)", 4, { status: 'contacted', statusChangedAt: new Date(2026, 9, 16) }, { ref: "Did Dave's kitchen" }),
    opt('bf', 'BathFitter', 5, { status: 'ruled_out' }),
  ],
  lines: [
    line('l1', 'mar', ['main'], 1840000), line('l2', 'mar', ['hall'], 980000), line('l3', 'mar', ['kids'], 720000),
    line('l4', 'har', ['main'], 2290000), line('l5', 'har', ['main', 'hall', 'kids'], 4450000),
    line('l6', 'che', ['main'], 1975000), line('l7', 'che', ['main', 'hall'], 2700000),
  ],
  followUps: [],
  contacts: new Map([['k1', { name: 'Luis', phone: '410-555-0142' }]]),
}

const setSelectedWork = vi.fn(async () => true)
const writers = { setSelectedWork }

function setNarrow(narrow: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: narrow, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

describe('ChoicePageView', () => {
  beforeEach(() => { setNarrow(false); setSelectedWork.mockClear(); navigate.mockClear() })

  it('shows the heading, summary and the Price heading for the selected work', () => {
    render(<ChoicePageView detail={detail} writers={writers} />)
    expect(screen.getByRole('heading', { name: 'Contractor' })).toBeInTheDocument()
    expect(screen.getByText(/4 options · 3 heard back/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Price · Main bath + Hall bath' })).toBeInTheDocument()
  })

  it('prices each option for exactly the selected work', () => {
    render(<ChoicePageView detail={detail} writers={writers} />)
    expect(screen.getByText('$28,200')).toBeInTheDocument()
    expect(screen.getByText('Main bath $18,400 + Hall bath $9,800')).toBeInTheDocument()
    expect(screen.getByText('No price for just these')).toBeInTheDocument()
    expect(screen.getByText(/^Priced: Main bath \$22,900/)).toBeInTheDocument()
  })

  it('toggling a piece writes the new selection', async () => {
    render(<ChoicePageView detail={detail} writers={writers} />)
    await userEvent.click(screen.getByRole('button', { name: /Kids' bath/ }))
    expect(setSelectedWork).toHaveBeenCalledWith(['main', 'hall', 'kids'])
  })

  it('clicking the Price heading orders by price, with no-price options after', async () => {
    render(<ChoicePageView detail={detail} writers={writers} />)
    await userEvent.click(screen.getByRole('button', { name: /^Price/ }))
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent ?? '')
    const order = ['Chesapeake', 'Martinez', 'Harbor', 'Rob'].map((n) => names.findIndex((t) => t.includes(n)))
    expect(order).toEqual([0, 1, 2, 3])
  })

  it('folds ruled-out options and expands them in place', async () => {
    render(<ChoicePageView detail={detail} writers={writers} />)
    expect(screen.queryByRole('cell', { name: /BathFitter/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '+1 ruled out · BathFitter' }))
    expect(screen.getByRole('cell', { name: /BathFitter/ })).toBeInTheDocument()
  })

  it('goes back to the goal', async () => {
    render(<ChoicePageView detail={detail} writers={writers} />)
    await userEvent.click(screen.getByRole('button', { name: '‹ Redo the bathrooms' }))
    expect(navigate).toHaveBeenCalled()
  })

  it('renders cards at narrow width, leaving empty facts out', () => {
    setNarrow(true)
    render(<ChoicePageView detail={detail} writers={writers} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const rob = screen.getByText("Rob (Dave's cousin)").closest('li') as HTMLElement
    expect(within(rob).getByText('References')).toBeInTheDocument()
    expect(within(rob).getByText(/^Contacted Oct 16 · no reply/)).toBeInTheDocument()
    expect(within(rob).queryByText('Price')).not.toBeInTheDocument()
    expect(within(rob).queryByText('Earliest start')).not.toBeInTheDocument()
    expect(within(rob).queryByText('Insured')).not.toBeInTheDocument()
  })
})
