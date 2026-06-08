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
    bucket: 'inbox', createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

function renderView(member: FamilyMember, tasks: Task[], overrides: Record<string, unknown> = {}) {
  const props = {
    member, tasks,
    onBack: vi.fn(), onSelectTask: vi.fn(), onEditInSettings: vi.fn(),
    projects: [], familyMembers: [member],
    onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onDeleteTask: vi.fn(),
    onPushTask: vi.fn(), onSetBucket: vi.fn(),
    ...overrides,
  }
  render(<MemberView {...(props as never)} />)
  return props
}

describe('MemberView', () => {
  it('renders the member name and role', () => {
    renderView(makeMember(), [])
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('parent')).toBeInTheDocument()
  })

  it('lists open tasks and fires onSelectTask when one is clicked', () => {
    const onSelectTask = vi.fn()
    const tasks = [makeTask({ id: 't1', title: 'Call dentist', assignedTo: 'm1' })]
    renderView(makeMember(), tasks, { onSelectTask })
    fireEvent.click(screen.getByText('Call dentist'))
    expect(onSelectTask).toHaveBeenCalledWith('t1')
  })

  it('open tasks are triageable (full reschedule fan-out present)', () => {
    const onToggleTask = vi.fn()
    const tasks = [makeTask({ id: 't1', title: 'Call dentist', assignedTo: 'm1' })]
    renderView(makeMember(), tasks, { onToggleTask })
    // The triage fan-out renders the horizon chips on the row.
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no open tasks', () => {
    renderView(makeMember(), [])
    expect(screen.getByText('No open tasks.')).toBeInTheDocument()
  })

  it('omits profile fields that have no value', () => {
    renderView(makeMember({ allergies: [] }), [])
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
  })

  it('renders profile fields that have values', () => {
    renderView(makeMember({ allergies: ['peanuts'] }), [])
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('peanuts')).toBeInTheDocument()
  })

  it('fires onBack and onEditInSettings', () => {
    const onBack = vi.fn(); const onEditInSettings = vi.fn()
    renderView(makeMember(), [], { onBack, onEditInSettings })
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    fireEvent.click(screen.getByRole('button', { name: /edit in settings/i }))
    expect(onBack).toHaveBeenCalled()
    expect(onEditInSettings).toHaveBeenCalled()
  })

  it('renders the Upcoming section for future-scheduled tasks', () => {
    const future = new Date()
    future.setDate(future.getDate() + 3)
    const tasks = [makeTask({ id: 'u1', title: 'Soccer practice', assignedTo: 'm1', bucket: 'timed', scheduledFor: future })]
    renderView(makeMember(), tasks)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
  })
})
