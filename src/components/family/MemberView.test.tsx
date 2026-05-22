import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { MemberView } from './MemberView'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'

function makeMember(over: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: 'm1', user_id: 'u1', name: 'Iris', initials: 'IR', color: 'purple',
    avatar_url: null, is_full_user: false, display_order: 0,
    created_at: '', member_type: 'core', role_label: 'parent', ...over,
  }
}

function makeTask(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2), title: 'task', completed: false,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

describe('MemberView', () => {
  it('renders the member name and role', () => {
    render(<MemberView member={makeMember()} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('parent')).toBeInTheDocument()
  })

  it('lists open tasks and fires onSelectTask when one is clicked', () => {
    const onSelectTask = vi.fn()
    const tasks = [makeTask({ id: 't1', title: 'Call dentist', assignedTo: 'm1' })]
    render(<MemberView member={makeMember()} tasks={tasks} onBack={vi.fn()} onSelectTask={onSelectTask} onEditInSettings={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Call dentist' }))
    expect(onSelectTask).toHaveBeenCalledWith('t1')
  })

  it('shows an empty state when there are no open tasks', () => {
    render(<MemberView member={makeMember()} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('No open tasks.')).toBeInTheDocument()
  })

  it('omits profile fields that have no value', () => {
    render(<MemberView member={makeMember({ allergies: [] })} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
  })

  it('renders profile fields that have values', () => {
    render(<MemberView member={makeMember({ allergies: ['peanuts'] })} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('peanuts')).toBeInTheDocument()
  })

  it('fires onBack and onEditInSettings', () => {
    const onBack = vi.fn(); const onEditInSettings = vi.fn()
    render(<MemberView member={makeMember()} tasks={[]} onBack={onBack} onSelectTask={vi.fn()} onEditInSettings={onEditInSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    fireEvent.click(screen.getByRole('button', { name: /edit in settings/i }))
    expect(onBack).toHaveBeenCalled()
    expect(onEditInSettings).toHaveBeenCalled()
  })

  it('renders the Upcoming section for future-scheduled tasks', () => {
    const future = new Date()
    future.setDate(future.getDate() + 3)
    const tasks = [makeTask({ id: 'u1', title: 'Soccer practice', assignedTo: 'm1', scheduledFor: future })]
    render(<MemberView member={makeMember()} tasks={tasks} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /soccer practice/i })).toBeInTheDocument()
  })
})
