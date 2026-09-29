import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/test-utils'
import { InboxView } from './InboxView'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'

// A failed task read drew "Inbox zero / Nothing is waiting for a decision."
// — telling someone their captures were gone when the fetch had failed.

vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ addTask: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useNoteSuggestion', () => ({ useNoteSuggestion: () => ({ suggestion: null, loading: false }) }))
vi.mock('@/apps/home/inbox/HomeNeedsDetailsSection', () => ({ HomeNeedsDetailsSection: () => null }))

function renderInbox(props: { loadFailed?: boolean; onRetryLoad?: () => void } = {}) {
  const actions = {
    onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), onDeleteTask: vi.fn(), familyMembers: [],
  } as unknown as ScheduleActionsValue
  return render(
    <ScheduleActionsProvider value={actions}>
      <InboxView tasks={[]} projects={[]} selectedItemId={null} onSelectItem={vi.fn()} panelOpen={false} onClosePanel={vi.fn()} {...props} />
    </ScheduleActionsProvider>,
  )
}

describe('Inbox — a failed load is not Inbox zero', () => {
  it('says the Inbox didn’t load and Try again reloads', () => {
    const onRetryLoad = vi.fn()
    renderInbox({ loadFailed: true, onRetryLoad })
    const notice = screen.getByRole('alert')
    expect(notice).toHaveTextContent('Your Inbox didn’t load.')
    expect(notice).toHaveTextContent('Your captures are safe — this is a connection problem.')
    expect(screen.queryByText('Inbox zero')).toBeNull()
    expect(screen.queryByText('All clear — nothing to triage')).toBeNull()
    fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }))
    expect(onRetryLoad).toHaveBeenCalledOnce()
  })

  it('an Inbox that loaded empty is still Inbox zero', () => {
    renderInbox({ loadFailed: false, onRetryLoad: vi.fn() })
    expect(screen.getByText('Inbox zero')).toBeInTheDocument()
    expect(screen.getByText('Nothing is waiting for a decision.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
