import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { CanvasActivityProvider, useCanvasActivity, type CanvasActivity } from '@/contexts/CanvasActivityContext'
import type { ApplyResult } from '@/lib/canvas/applyChangeSet'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import { DiscussChangeCard } from './DiscussChangeCard'
import { DiscussionThread } from './DiscussionThread'

const card: ChangeSet = {
  key: 'cs-1', title: '2 changes to Book the dentist', ops: [
    { key: 'cs-1:0', op: 'add', title: 'Call the office' },
    { key: 'cs-1:1', op: 'add', title: 'Find the insurance card' },
  ],
}

function Probe({ onReady }: { onReady: (a: CanvasActivity) => void }) {
  const a = useCanvasActivity()
  useEffect(() => { onReady(a) })
  return null
}

function renderInShell(cardKey: string | null, applyChanges: (set: ChangeSet) => Promise<ApplyResult>) {
  let api!: CanvasActivity
  const utils = render(
    <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} refetch={async () => {}} applyChanges={applyChanges}
      writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }}>
      <Probe onReady={(a) => { api = a }} />
      <DiscussChangeCard cardKey={cardKey} busy={false} />
    </CanvasActivityProvider>,
  )
  return { ...utils, api: () => api }
}

describe('DiscussChangeCard', () => {
  it("shows the thread's card, saves it through the shell's apply path, then offers Undo", async () => {
    const undo = vi.fn(async () => true)
    const applyChanges = vi.fn(async (): Promise<ApplyResult> => ({ ok: true, ids: ['n1', 'n2'], undo }))
    const { api } = renderInShell('cs-1', applyChanges)
    act(() => api().setChangeSet(card))

    expect(screen.getByRole('region', { name: card.title })).toBeInTheDocument()
    expect(screen.getByText('Call the office')).toBeInTheDocument()
    expect(screen.getByText('Draft · Not saved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    await waitFor(() => expect(screen.getByText('Saved 2 changes')).toBeInTheDocument())
    expect(applyChanges).toHaveBeenCalledWith(expect.objectContaining({ key: 'cs-1' }))
    expect(screen.queryByRole('region', { name: card.title })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Undo these 2 changes' }))
    await waitFor(() => expect(screen.getByText('Those changes have been undone.')).toBeInTheDocument())
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('a failed save stays on the card with its reason', async () => {
    const applyChanges = vi.fn(async (): Promise<ApplyResult> => ({ ok: false, reason: 'failed', reverted: true, kept: [] }))
    const { api } = renderInShell('cs-1', applyChanges)
    act(() => api().setChangeSet(card))
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save. Nothing was changed. Try again."))
    expect(screen.getByRole('region', { name: card.title })).toBeInTheDocument()
  })

  it('Discard drops the pending card', () => {
    const { api } = renderInShell('cs-1', vi.fn())
    act(() => api().setChangeSet(card))
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(screen.queryByRole('region', { name: card.title })).toBeNull()
    expect(api().changeSet).toBeNull()
  })

  it('a card proposed somewhere else is not shown in the discussion', () => {
    const { api } = renderInShell('cs-1', vi.fn())
    act(() => api().setChangeSet({ ...card, key: 'week-card', title: '5 changes to your week' }))
    expect(screen.queryByRole('region')).toBeNull()
  })
})

describe('DiscussionThread card slot', () => {
  it('renders the card under the messages', () => {
    render(
      <DiscussionThread title="Book the dentist" scope="compound" peopleLabel="Just you" stateLabel="" others={[]}
        messages={[{ id: 'm1', role: 'assistant', content: "I've put it on a card.", timestamp: new Date() }]}
        loading={false} sending={false} error={null} toolActivity={[]} currentUserId="u1" familyMembers={[]} suggestions={[]}
        onPost={vi.fn()} onAsk={vi.fn()} onClose={vi.fn()}
        card={<div data-testid="card-slot">card</div>} />,
    )
    expect(screen.getByTestId('card-slot')).toBeInTheDocument()
  })
})
