import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MultiAssigneeDropdown } from './MultiAssigneeDropdown'
import type { FamilyMember } from '@/types/family'

const members: FamilyMember[] = [
  { id: 'm1', name: 'Scott', initials: 'SK', color: 'blue' } as FamilyMember,
  { id: 'm2', name: 'Iris', initials: 'IR', color: 'purple' } as FamilyMember,
]

describe('MultiAssigneeDropdown click containment', () => {
  // Regression: assignee clicks used to bubble to ancestor row handlers,
  // which open/toggle the detail panel — clicking "Assignee" opened the
  // side panel instead of the picker (reported 2026-06-11).
  it('does not propagate trigger clicks to ancestors', () => {
    const ancestorClick = vi.fn()
    render(
      <div onClick={ancestorClick}>
        <MultiAssigneeDropdown members={members} selectedIds={[]} onSelect={() => {}} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /assigned/i }))
    expect(ancestorClick).not.toHaveBeenCalled()
    // and the menu actually opened
    expect(screen.getByText('Scott')).toBeInTheDocument()
  })

  it('selecting a member fires onSelect and does not reach ancestors', () => {
    const ancestorClick = vi.fn()
    const onSelect = vi.fn()
    render(
      <div onClick={ancestorClick}>
        <MultiAssigneeDropdown members={members} selectedIds={[]} onSelect={onSelect} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /assigned/i }))
    fireEvent.click(screen.getByText('Iris'))
    expect(onSelect).toHaveBeenCalledWith(['m2'])
    expect(ancestorClick).not.toHaveBeenCalled()
  })
})
