import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PanelClassify } from './PanelClassify'
import type { FamilyMember } from '@/types/family'

const members: FamilyMember[] = [
  { id: 'm1', name: 'Iris' } as FamilyMember,
  { id: 'm2', name: 'Scott' } as FamilyMember,
]

describe('PanelClassify', () => {
  it('shows the current context and reports changes', () => {
    const onContextChange = vi.fn()
    render(
      <PanelClassify
        context="work"
        onContextChange={onContextChange}
        members={members}
        selectedAssigneeIds={[]}
        onAssigneesChange={vi.fn()}
      />,
    )
    // ContextPicker renders a trigger; must open it before the menu items appear
    fireEvent.click(screen.getByRole('button', { name: /set context/i }))
    fireEvent.click(screen.getByRole('button', { name: /family/i }))
    expect(onContextChange).toHaveBeenCalledWith('family')
  })

  it('never renders a scope control — scope is derived, not chosen', () => {
    render(
      <PanelClassify
        context={undefined}
        onContextChange={vi.fn()}
        members={members}
        selectedAssigneeIds={[]}
        onAssigneesChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole('group', { name: /who can see this/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Us' })).toBeNull()
  })

  it('reflects the current assignee selection in the trigger label', () => {
    render(
      <PanelClassify
        context={undefined}
        onContextChange={vi.fn()}
        members={members}
        selectedAssigneeIds={['m1']}
        onAssigneesChange={vi.fn()}
      />,
    )
    // MultiAssigneeDropdown trigger aria-label reports count of selected members
    expect(
      screen.getByRole('button', { name: /1 assigned/i }),
    ).toBeInTheDocument()
  })
})
