import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { CanvasActivityProvider, useCanvasActivity, type CanvasActivity, type CanvasActivityProviderProps } from '@/contexts/CanvasActivityContext'
import type { ApplyResult } from '@/lib/canvas/applyChangeSet'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import type { ChatMessage } from '@/types/chat'
import { ConversationStrip } from './ConversationStrip'

const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'Shower at 4 p.m. and take the bike tomorrow.', timestamp: new Date() },
  { id: 'a1', role: 'assistant', content: 'Here is the draft. You can change it before saving.', timestamp: new Date() },
]
const proposal: ChangeSet = { key: 'draft-1', title: '2 changes to your week', ops: [
  { key: 'shower', op: 'add', title: 'Shower', date: '2026-10-15', time: '16:00' },
  { key: 'bike', op: 'add', title: 'Take bicycle to Bicycle Connection', date: '2026-10-16' },
] }
function mount(applyChanges: CanvasActivityProviderProps['applyChanges'] = vi.fn(), initialMessages = messages) {
  const seen: { activity?: CanvasActivity } = {}
  const onSend = vi.fn()
  function Panel({ busy = false, history = initialMessages }: { busy?: boolean; history?: ChatMessage[] }) {
    const activity = useCanvasActivity()
    useEffect(() => { seen.activity = activity })
    return <ConversationStrip chatOnly panel messages={history} busy={busy} onSend={onSend}
      walk={{ label: 'Help me plan the rest of my week', message: 'Help me plan the rest of my week.' }}
      voice={{ available: true, active: true, status: 'live', turn: 'listening', heard: 'Duplicate live words', reply: 'Duplicate spoken reply', start: vi.fn(), stop: vi.fn() }} />
  }
  function Harness(props: { busy?: boolean; history?: ChatMessage[] }) {
    return <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={vi.fn()} applyChanges={applyChanges}><Panel {...props} /></CanvasActivityProvider>
  }
  const view = render(<Harness />)
  return { activity: () => seen.activity!, onSend, update: (props: { busy?: boolean; history?: ChatMessage[] }) => view.rerender(<Harness {...props} />) }
}

it('uses one text conversation without stale voice controls or duplicate captions', () => {
  mount()
  expect(screen.getByRole('region', { name: 'Chat with Symphony' })).toBeInTheDocument()
  expect(screen.getByLabelText('Message Symphony')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Talk|Done|End|Dictate|Plan the rest/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/Duplicate/)).not.toBeInTheDocument()
})

it('shows one thinking status and does not repeat the starter after the conversation begins', () => {
  const h = mount()
  h.update({ busy: true, history: [...messages, { id: 'a2', role: 'assistant', content: '', timestamp: new Date() }] })
  expect(screen.getAllByText('Symphony is thinking…')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Help me plan the rest of my week' })).not.toBeInTheDocument()
})

it('focuses correction entry, prevents saving an old draft during revision, and saves only the replacement', async () => {
  const apply = vi.fn(async () => ({ ok: true as const, ids: ['shower', 'bike'], undo: async () => true }))
  const h = mount(apply)
  act(() => h.activity().setChangeSet(proposal))
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Make a change' }))
  const field = screen.getByRole('textbox', { name: 'Message Symphony' })
  expect(field).toHaveFocus()
  expect(field).toHaveAttribute('placeholder', 'What would you like to change?')
  fireEvent.change(field, { target: { value: 'Make the bicycle Saturday instead.' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(h.onSend).toHaveBeenCalledWith('Make the bicycle Saturday instead.')
  h.update({ busy: true })
  fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
  expect(screen.getByRole('button', { name: 'Save 2 changes' })).toBeDisabled()
  expect(apply).not.toHaveBeenCalled()
  const revised = { ...proposal, key: 'draft-2', ops: proposal.ops.map(op => op.key === 'bike' ? { ...op, date: '2026-10-17' } : op) }
  act(() => h.activity().setChangeSet(revised))
  h.update({ busy: false })
  expect(document.querySelectorAll('.change-card')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
  await screen.findByText('Saved 2 changes')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply.mock.calls[0][0]).toMatchObject(revised)
})

it('waits for a successful writer, prevents double save, and Undo reverses the saved operations', async () => {
  let finish!: (r: ApplyResult) => void
  let stored: string[] = []
  const undo = vi.fn(async () => { stored = []; return true })
  const apply = vi.fn(() => new Promise<ApplyResult>(resolve => { finish = resolve }))
  const h = mount(apply)
  act(() => h.activity().setChangeSet(proposal))
  const save = screen.getByRole('button', { name: 'Save 2 changes' })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(apply).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Discard draft' })).toBeDisabled()
  expect(screen.queryByText('Saved 2 changes')).not.toBeInTheDocument()
  expect(document.querySelector('.canvas-chat-result')).toBeNull()
  expect(stored).toEqual([])
  await act(async () => { stored = ['shower', 'bike']; finish({ ok: true, ids: stored, undo }) })
  expect(screen.getByText('Saved 2 changes')).toBeInTheDocument()
  expect(document.querySelector('.change-card')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Undo these 2 changes' }))
  await screen.findByText('Those changes have been undone.')
  expect(undo).toHaveBeenCalledTimes(1)
  expect(stored).toEqual([])
  expect(screen.queryByRole('button', { name: /^Undo / })).not.toBeInTheDocument()
})

it('retains Undo after a question, without presenting that answer as a new save', async () => {
  const undo = vi.fn(async () => true)
  const h = mount(async () => ({ ok: true, ids: ['a', 'b'], undo }))
  act(() => h.activity().setChangeSet(proposal))
  fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
  await screen.findByText('Saved 2 changes')
  act(() => h.activity().turnStarted('What else is on Friday?', false))
  act(() => h.activity().turnEnded({ didWrite: false, error: null, text: 'The gate latch.' }))
  expect(screen.queryByText('Saved 2 changes')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Undo last saved changes' }))
  await waitFor(() => expect(undo).toHaveBeenCalledTimes(1))
})

describe('failed saves remain visible and honest', () => {
  it.each([
    { result: { ok: false, reason: 'stale', title: 'Shower' } as ApplyResult, message: /changed since I proposed/, partial: false },
    { result: { ok: false, reason: 'failed', reverted: true, kept: [] } as ApplyResult, message: /Nothing was changed/, partial: false },
    { result: { ok: false, reason: 'failed', reverted: false, kept: ['shower'] } as ApplyResult, message: /some of it stayed saved/, partial: true },
  ])('handles $result.reason / partial=$partial without claiming Saved', async ({ result, message, partial }) => {
    const h = mount(async () => result)
    act(() => h.activity().setChangeSet(proposal))
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(document.querySelector('.canvas-chat-result')).toBeNull()
    expect(screen.queryByText('Saved 2 changes')).not.toBeInTheDocument()
    if (partial) expect(screen.getByRole('button', { name: 'Ask for an updated card' })).toBeDisabled()
  })
})

it('discards a draft without writing or erasing the conversation', () => {
  const apply = vi.fn()
  const h = mount(apply)
  act(() => h.activity().setChangeSet(proposal))
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
  expect(document.querySelector('.change-card')).toBeNull()
  expect(screen.getByText(messages[0].content)).toBeInTheDocument()
  expect(h.activity().takeChangeCard()).toMatchObject({ state: 'dismissed' })
  expect(apply).not.toHaveBeenCalled()
})
