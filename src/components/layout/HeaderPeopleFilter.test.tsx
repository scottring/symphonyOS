import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ASSIGNEE_FILTER_KEY } from '@/hooks/useAssigneeFilter'

vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [{ id: 'iris', name: 'Iris', initials: 'IR', color: 'purple' }] }),
}))

import { HeaderPeopleFilter, peopleFilterApplies } from './HeaderPeopleFilter'

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><HeaderPeopleFilter /></MemoryRouter>)

describe('HeaderPeopleFilter — the top bar’s people lens', () => {
  beforeEach(() => localStorage.removeItem(ASSIGNEE_FILTER_KEY))

  it('applies on every horizon and the Inbox, nowhere else', () => {
    for (const p of ['/', '/today', '/week', '/month', '/season', '/year', '/inbox']) expect(peopleFilterApplies(p)).toBe(true)
    for (const p of ['/routines', '/notes', '/settings', '/task/abc']) expect(peopleFilterApplies(p)).toBe(false)
  })

  it('shows on the Week and is hidden on Routines', () => {
    at('/week')
    expect(screen.getByRole('button', { name: 'People filter' })).toBeTruthy()
    at('/routines')
    expect(screen.getAllByRole('button', { name: /People filter/ })).toHaveLength(1)
  })

  it('says it is on, and names who, when someone is chosen', () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['iris']))
    at('/month')
    const btn = screen.getByRole('button', { name: 'People filter, on' })
    expect(btn.getAttribute('title')).toBe('People: Iris')
    expect(btn.className).toContain('is-on')
    expect(btn.textContent).toContain('IR')
  })
})
