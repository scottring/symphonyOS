import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { GoalsList } from './GoalsList'
import type { GoalArea, Goal } from '@/types/goal'

const area: GoalArea = { id: 'a1', name: 'Home Organization', sortOrder: 0, createdAt: new Date() }

function makeGoal(name: string): Goal {
  return {
    id: `g-${name.slice(0, 6)}`, areaId: 'a1', name, year: 2026, status: 'active',
    sortOrder: 0, actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(),
  }
}

const baseProps = {
  areas: [area],
  goals: [],
  loading: false,
  currentQuarter: 'Q3' as const,
  year: 2026,
  onSelectGoal: vi.fn(),
  onAddArea: vi.fn().mockResolvedValue(null),
  onRenameArea: vi.fn(),
  onAddGoal: vi.fn().mockResolvedValue(null),
  onUpdateGoal: vi.fn(),
  onDeleteArea: vi.fn(),
}

describe('GoalsList area rename', () => {
  it('click the area title → edit inline → Enter commits the new name', async () => {
    const onRenameArea = vi.fn()
    const { user } = render(<GoalsList {...baseProps} onRenameArea={onRenameArea} />)
    await user.click(screen.getByText('Home Organization'))
    const input = screen.getByRole('textbox', { name: 'Area name' })
    await user.clear(input)
    await user.type(input, 'Everything in Its Right Place{Enter}')
    expect(onRenameArea).toHaveBeenCalledWith('a1', 'Everything in Its Right Place')
  })

  it('Escape cancels without renaming', async () => {
    const onRenameArea = vi.fn()
    const { user } = render(<GoalsList {...baseProps} onRenameArea={onRenameArea} />)
    await user.click(screen.getByText('Home Organization'))
    await user.keyboard('{Escape}')
    expect(onRenameArea).not.toHaveBeenCalled()
    expect(screen.getByText('Home Organization')).toBeInTheDocument()
  })

  it('committing an unchanged or empty name is a no-op', async () => {
    const onRenameArea = vi.fn()
    const { user } = render(<GoalsList {...baseProps} onRenameArea={onRenameArea} />)
    await user.click(screen.getByText('Home Organization'))
    await user.keyboard('{Enter}') // unchanged
    expect(onRenameArea).not.toHaveBeenCalled()
  })
})

describe('GoalsList goal coaching', () => {
  it('shows the vague hint on a clearly-vague goal, with a Sharpen affordance', () => {
    render(<GoalsList {...baseProps} goals={[makeGoal('Make home into home')]} />)
    expect(screen.getByText(/name what’s true by next year/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sharpen' })).toBeInTheDocument()
  })

  it('does not show the vague hint on a sharp goal, but still offers Sharpen', () => {
    render(<GoalsList {...baseProps} goals={[makeGoal('Shipped the beta to 10 customers')]} />)
    expect(screen.queryByText(/name what’s true by next year/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sharpen' })).toBeInTheDocument()
  })

  it('dismissing the vague hint hides it without touching the goal', async () => {
    const { user } = render(<GoalsList {...baseProps} goals={[makeGoal('Get healthy')]} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss hint' }))
    expect(screen.queryByText(/name what’s true by next year/)).not.toBeInTheDocument()
    expect(baseProps.onUpdateGoal).not.toHaveBeenCalled()
  })

  it('teaches past-tense phrasing in the add-goal placeholder', async () => {
    const { user } = render(<GoalsList {...baseProps} />)
    await user.click(screen.getByRole('button', { name: 'Add Goal' }))
    expect(screen.getByPlaceholderText(/past tense/i)).toBeInTheDocument()
  })
})

describe('GoalsList loading gate', () => {
  it('while loading with no areas, shows "Loading goals…" and not the empty state', () => {
    render(<GoalsList {...baseProps} areas={[]} loading />)
    expect(screen.getByText('Loading goals…')).toBeInTheDocument()
    expect(screen.queryByText('No goals yet')).not.toBeInTheDocument()
  })

  it('once settled with no areas, shows the empty state and not the loading text', () => {
    render(<GoalsList {...baseProps} areas={[]} loading={false} />)
    expect(screen.getByText('No goals yet')).toBeInTheDocument()
    expect(screen.queryByText('Loading goals…')).not.toBeInTheDocument()
  })
})
