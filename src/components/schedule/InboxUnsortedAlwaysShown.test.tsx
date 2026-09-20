import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { LAYERS_KEY } from '@/hooks/useDomain'
import type { Task } from '@/types/task'

// The bug (first real-data walkthrough, 2026-09-20): with the tag filter on
// Family, a fresh ⌘K capture — Unsorted, private — vanished behind "Inbox
// zero". The Inbox is the one place an Unsorted capture must always appear;
// tagged rows keep following the layer rule.

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ addTask: vi.fn() }),
}))
vi.mock('@/hooks/useNotes', () => ({
  useNotes: () => ({ notes: [], addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }),
}))
vi.mock('@/apps/home/inbox/HomeNeedsDetailsSection', () => ({
  HomeNeedsDetailsSection: () => null,
}))

const base = { completed: false, createdAt: new Date('2026-09-20T10:00:00'), updatedAt: new Date('2026-09-20T10:00:00'), bucket: 'inbox' }
const unsorted = { ...base, id: 'u', title: 'Plan Yom Kippur reading activity', context: null } as Task
const personal = { ...base, id: 'p', title: 'Renew gym membership', context: 'personal' } as Task
const family = { ...base, id: 'f', title: 'Book the sitter', context: 'family' } as Task

function renderInbox() {
  const actions = {
    onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), onDeleteTask: vi.fn(), familyMembers: [],
  } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={actions}>
      <InboxView tasks={[unsorted, personal, family]} projects={[]} selectedItemId={null} onSelectItem={vi.fn()} panelOpen={false} onClosePanel={vi.fn()} />
    </ScheduleActionsProvider>,
  )
}

describe('Inbox always shows Unsorted captures', () => {
  beforeEach(() => { localStorage.clear() })

  it('shows an Unsorted capture even when the tag filter is Family only', () => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(['family']))
    renderInbox()
    expect(screen.getByText('Plan Yom Kippur reading activity')).toBeInTheDocument()
    expect(screen.getByText('Book the sitter')).toBeInTheDocument()
    // Tagged rows still follow the layer rule.
    expect(screen.queryByText('Renew gym membership')).not.toBeInTheDocument()
    expect(screen.queryByText('Inbox zero')).not.toBeInTheDocument()
  })

  it('shows everything when every layer is checked', () => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(['work', 'family', 'personal', 'unsorted']))
    renderInbox()
    expect(screen.getByText('Renew gym membership')).toBeInTheDocument()
    expect(screen.getByText('Plan Yom Kippur reading activity')).toBeInTheDocument()
  })
})
