import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { ChoiceRow } from '@/lib/choices/db'
import type { Choice, ChoiceOption } from '@/types/choice'

const navigate = vi.fn()
const create = vi.fn()
let rows: ChoiceRow[] = []

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/hooks/useChoices', () => ({
  CHOICES_UPDATED: 'symphony-choices-updated',
  useGoalChoices: () => ({ rows, loading: false, refetch: vi.fn(), create }),
}))

const now = new Date()
const choice = (o: Partial<Choice>): Choice => ({
  id: 'c1', userId: 'u', goal: { kind: 'task', id: 'g1' }, title: 'Roofer', status: 'open',
  decidedWork: [], columns: [], work: [], selectedWork: [], sortOrder: 0, createdAt: now, updatedAt: now, ...o,
})
const option = (id: string, o: Partial<ChoiceOption> = {}): ChoiceOption => ({
  id, choiceId: 'c1', userId: 'u', name: `Opt ${id}`, status: 'considering', statusChangedAt: now,
  values: {}, sortOrder: 0, updatedAt: now, ...o,
})

import { ChoicesSection } from './ChoicesSection'

describe('ChoicesSection', () => {
  beforeEach(() => {
    navigate.mockClear()
    create.mockReset()
    rows = [
      { choice: choice({}), options: [option('a'), option('b', { status: 'heard_back' })], followUps: [] },
      {
        choice: choice({ id: 'c2', title: 'Painter', status: 'decided', chosenOptionId: 'p' }),
        options: [option('p', { name: 'Acme', status: 'chosen' })], followUps: [],
      },
    ]
  })

  it('renders open and decided rows with their summaries', () => {
    render(<ChoicesSection goal={{ kind: 'task', id: 'g1' }} />)
    expect(screen.getByText('Roofer')).toBeInTheDocument()
    expect(screen.getByText('2 options · 1 heard back')).toBeInTheDocument()
    expect(screen.getByText('✓ Painter')).toBeInTheDocument()
    expect(screen.getByText('Chose Acme')).toBeInTheDocument()
  })

  it('colors only the waiting fragment amber', () => {
    rows = [{
      choice: choice({}),
      options: [option('a', { status: 'contacted' })],
      followUps: [{ id: 'f', optionId: 'a', completed: false, waitingSince: now } as never],
    }]
    render(<ChoicesSection goal={{ kind: 'task', id: 'g1' }} />)
    expect(screen.getByText(/waiting/)).toHaveClass('text-amber-700')
  })

  it('navigates to the choice when a row is clicked', async () => {
    render(<ChoicesSection goal={{ kind: 'task', id: 'g1' }} />)
    await userEvent.click(screen.getByText('Roofer'))
    expect(navigate).toHaveBeenCalledWith('/choice/c1')
  })

  it('creates a choice on Enter and opens it', async () => {
    create.mockResolvedValue(choice({ id: 'new', title: 'Contractor' }))
    render(<ChoicesSection goal={{ kind: 'task', id: 'g1' }} />)
    await userEvent.click(screen.getByText('+ Choice'))
    await userEvent.type(screen.getByPlaceholderText('What are you choosing? e.g. Contractor'), 'Contractor{Enter}')
    expect(create).toHaveBeenCalledWith('Contractor')
    expect(navigate).toHaveBeenCalledWith('/choice/new')
  })

  it('does nothing for an empty title', async () => {
    render(<ChoicesSection goal={{ kind: 'task', id: 'g1' }} />)
    await userEvent.click(screen.getByText('+ Choice'))
    await userEvent.type(screen.getByPlaceholderText(/What are you choosing/), '{Enter}')
    expect(create).not.toHaveBeenCalled()
  })

  it('shows only heading and + Choice when empty', () => {
    rows = []
    render(<ChoicesSection goal={{ kind: 'task', id: 'g1' }} />)
    expect(screen.getByText('Choices')).toBeInTheDocument()
    expect(screen.getByText('+ Choice')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
