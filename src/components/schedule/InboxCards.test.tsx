import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Task } from '@/types/task'
import { DenseInboxRow } from './DenseInboxRow'
import { WaitingSection } from './WaitingSection'

const task = (o: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Call Sleep Study', completed: false, bucket: 'inbox', createdAt: new Date(), updatedAt: new Date(), ...o,
} as Task)

// Scott, 2026-10-07 (design B): the Inbox as cards — the icon tile is the check.
describe('the Inbox card', () => {
  const renderCard = (t: Task, extra: Partial<Parameters<typeof DenseInboxRow>[0]> = {}) => {
    const props = { task: t, familyMembers: [], quickActions: [], onQuickAction: vi.fn(), onToggleComplete: vi.fn(), onUpdate: vi.fn(), onSelect: vi.fn(), look: 'card' as const, ...extra }
    render(<DenseInboxRow {...props} />)
    return props
  }

  it('finishes the task from its icon tile, without opening it', () => {
    const p = renderCard(task())
    fireEvent.click(screen.getByRole('button', { name: /^Done: Call Sleep Study/ }))
    expect(p.onToggleComplete).toHaveBeenCalledOnce()
    expect(p.onSelect).not.toHaveBeenCalled()
  })

  it('shows the note as a preview only when it says something, and where it came from', () => {
    renderCard(task({ notes: '<p>Offered the 29th, 30th or 31st — confirm dates with Iris.</p>', captureId: 'c1' }))
    expect(screen.getByText('Offered the 29th, 30th or 31st — confirm dates with Iris.')).toBeInTheDocument()
    expect(screen.getByText('From an email')).toBeInTheDocument()
  })

  it('leaves a bare link out', () => {
    renderCard(task({ notes: 'https://example.com/form' }))
    expect(screen.queryByText('https://example.com/form')).toBeNull()
  })

  it('opens the task from its title, and keeps its triage actions under it', () => {
    const p = renderCard(task(), { triageMenu: <button type="button">Today</button> })
    fireEvent.click(screen.getByText('Call Sleep Study'))
    expect(p.onSelect).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })
})

describe('the Waiting on card', () => {
  it('says who it waits on and when to check back, and its tile finishes it', () => {
    const onCompleteTask = vi.fn()
    const t = task({ id: 'w1', title: 'Set up Infinite Campus', isWaiting: true, waitingFor: 'Ms. Davis to respond to request', scope: 'compound' })
    render(<WaitingSection rows={[{ task: t, checkBack: new Date(2099, 0, 1), due: false }]} onUpdateTask={vi.fn()} onCompleteTask={onCompleteTask} />)
    fireEvent.click(screen.getByRole('button', { name: /Waiting on · 1/ }))
    expect(screen.getByText(/Waiting on Ms\. Davis to respond to request/)).toBeInTheDocument()
    expect(screen.getByText(/check back/)).toBeInTheDocument()
    expect(screen.getByText('Shared')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done: Set up Infinite Campus' }))
    expect(onCompleteTask).toHaveBeenCalledWith('w1')
  })
})
