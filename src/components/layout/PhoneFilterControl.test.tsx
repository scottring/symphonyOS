import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PhoneFilterControl } from './PhoneFilterControl'
import type { FamilyMember } from '@/types/family'

const members = [
  { id: 'm1', name: 'Edith', color: 'blue', initials: 'E' },
  { id: 'm2', name: 'Liam', color: 'green', initials: 'L' },
] as unknown as FamilyMember[]

describe('PhoneFilterControl', () => {
  afterEach(() => localStorage.removeItem('symphony-layers'))

  it('shows no "on" indicator while nothing is narrowed', () => {
    render(<PhoneFilterControl />)
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.queryByTestId('filters-on-dot')).toBeNull()
  })

  it('marks the trigger when a person filter is on', () => {
    render(<PhoneFilterControl selectedAssignees={['m1']} onSelectAssignees={vi.fn()} assigneesWithTasks={members} />)
    expect(screen.getByRole('button', { name: 'Filters, on' })).toBeInTheDocument()
    expect(screen.getByTestId('filters-on-dot')).toBeInTheDocument()
  })

  it('marks the trigger when a life area is off, and one sheet changes both lenses', () => {
    localStorage.setItem('symphony-layers', JSON.stringify(['work']))
    const onSelectAssignees = vi.fn()
    render(<PhoneFilterControl selectedAssignees={[]} onSelectAssignees={onSelectAssignees} assigneesWithTasks={members} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filters, on' }))
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet).toContainElement(document.activeElement as HTMLElement)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Liam' }))
    expect(onSelectAssignees).toHaveBeenCalledWith(['m2'])
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(onSelectAssignees).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })

  it('keeps the last checked life area on, and closes on Escape', () => {
    localStorage.setItem('symphony-layers', JSON.stringify(['work']))
    render(<PhoneFilterControl />)
    fireEvent.click(screen.getByRole('button', { name: 'Filters, on' }))
    expect(screen.getByRole('checkbox', { name: 'Work' })).toBeDisabled()
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
  })
})
