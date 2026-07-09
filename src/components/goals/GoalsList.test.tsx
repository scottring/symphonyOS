import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { GoalsList } from './GoalsList'
import type { GoalArea } from '@/types/goal'

const area: GoalArea = { id: 'a1', name: 'Home Organization', sortOrder: 0, createdAt: new Date() }

const baseProps = {
  areas: [area],
  goals: [],
  currentQuarter: 'Q3' as const,
  year: 2026,
  onSelectGoal: vi.fn(),
  onAddArea: vi.fn().mockResolvedValue(null),
  onRenameArea: vi.fn(),
  onAddGoal: vi.fn().mockResolvedValue(null),
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
