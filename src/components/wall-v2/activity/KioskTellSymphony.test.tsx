import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askWall } from '@/lib/wall/voice/wallVoiceActions'
import { KioskTellSymphony, type WallVoice } from './KioskTellSymphony'

vi.mock('@/lib/wall/voice/wallVoiceActions', () => ({
  askWall: vi.fn(async (): Promise<{ answer: string } | { change: string }> => ({ answer: 'Mia has swim at 4:15.' })),
  speechFor: vi.fn(async () => null),
}))

// The Pi's listener, as the page sees it: a local WebSocket.
class FakeSocket {
  static last: FakeSocket | null = null
  static OPEN = 1
  readyState = 0
  sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) { FakeSocket.last = this }
  send(d: string) { this.sent.push(JSON.parse(d)) }
  close() { this.onclose?.() }
  open(state = 'ready') {
    this.readyState = 1
    this.onopen?.()
    this.emit({ type: 'state', state, wake: 'Hey Symphony', muted: false, quiet: false })
  }
  emit(m: object) { this.onmessage?.({ data: JSON.stringify(m) }) }
}

const realWS = globalThis.WebSocket
beforeEach(() => { (globalThis as { WebSocket: unknown }).WebSocket = FakeSocket; FakeSocket.last = null })
afterEach(() => { (globalThis as { WebSocket: unknown }).WebSocket = realWS })

function voice(): WallVoice & { save: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn> } {
  const undo = vi.fn(async () => true)
  return {
    undo,
    save: vi.fn(async () => ({ said: 'Added milk to Groceries.', undo })),
    snapshot: () => 'Today:\n- 4:15p Swim (Mia)',
  } as never
}

describe('Tell Symphony with the wall listener', () => {
  it('a capture heard after the wake phrase saves, says so, and can be undone', async () => {
    const v = voice()
    render(<KioskTellSymphony onCommand={() => ''} voice={v} />)
    await act(async () => FakeSocket.last!.open())
    expect(screen.getByRole('button', { name: 'Turn the microphone off' })).toBeInTheDocument()
    expect(screen.getByText('Say “Hey Symphony” or tap')).toBeInTheDocument()

    await act(async () => FakeSocket.last!.emit({ type: 'heard', id: '1', text: 'Add milk to the grocery list.', via: 'wake' }))
    expect(v.save).toHaveBeenCalledWith({ kind: 'groceries', items: ['milk'] })
    expect(await screen.findAllByText('Added milk to Groceries.')).not.toHaveLength(0)
    // Said back through the listener (the offline voice: no natural one in tests).
    await waitFor(() => expect(FakeSocket.last!.sent).toContainEqual({ type: 'say', text: 'Added milk to Groceries.' }))

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    await waitFor(() => expect(v.undo).toHaveBeenCalled())
    expect(await screen.findAllByText('Undone.')).not.toHaveLength(0)
  })

  it('a question is answered from the wall and spoken', async () => {
    render(<KioskTellSymphony onCommand={() => ''} voice={voice()} />)
    await act(async () => FakeSocket.last!.open())
    await act(async () => FakeSocket.last!.emit({ type: 'heard', id: '2', text: 'Is Mia at swim today?', via: 'wake' }))
    expect(await screen.findAllByText('Mia has swim at 4:15.')).not.toHaveLength(0)
    await waitFor(() => expect(FakeSocket.last!.sent).toContainEqual({ type: 'say', text: 'Mia has swim at 4:15.' }))
  })

  it('a request to change something the wall cannot change is saved to the Inbox, with Undo', async () => {
    vi.mocked(askWall).mockResolvedValueOnce({ change: 'add Feed Jax to Ella’s morning routine' })
    const v = voice()
    render(<KioskTellSymphony onCommand={() => ''} voice={v} />)
    await act(async () => FakeSocket.last!.open())
    await act(async () => FakeSocket.last!.emit({ type: 'heard', id: '9', text: 'can we add feed Jax to Ella’s morning routine', via: 'wake' }))
    await waitFor(() => expect(v.save).toHaveBeenCalledWith({ kind: 'inbox', text: 'add Feed Jax to Ella’s morning routine' }))
    expect(await screen.findAllByText(/I saved it to your inbox: add Feed Jax to Ella’s morning routine/)).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument()
  })

  it('tapping the pill listens; the mic button mutes', async () => {
    render(<KioskTellSymphony onCommand={() => ''} voice={voice()} />)
    await act(async () => FakeSocket.last!.open())
    fireEvent.click(screen.getByRole('button', { name: /Tell Symphony/ }))
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'listen' })
    fireEvent.click(screen.getByRole('button', { name: 'Turn the microphone off' }))
    expect(FakeSocket.last!.sent).toContainEqual({ type: 'mute', on: true })
  })

  it('a kitchen command still runs, and nothing is saved for it', async () => {
    const v = voice()
    const onCommand = vi.fn(() => 'Timer · 5 min')
    render(<KioskTellSymphony onCommand={onCommand} voice={v} />)
    await act(async () => FakeSocket.last!.open())
    await act(async () => FakeSocket.last!.emit({ type: 'heard', id: '3', text: 'set a timer for 5 minutes', via: 'tap' }))
    expect(onCommand).toHaveBeenCalledWith({ type: 'start-timer', minutes: 5 })
    expect(v.save).not.toHaveBeenCalled()
  })

  it('without the listener, typing a capture still saves it, and nothing is spoken', async () => {
    const v = voice()
    render(<KioskTellSymphony onCommand={() => ''} voice={v} />)
    expect(screen.queryByRole('button', { name: /microphone/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Tell Symphony/ }))
    fireEvent.change(screen.getByLabelText('Type a command'), { target: { value: 'we need paper towels' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }))
    await waitFor(() => expect(v.save).toHaveBeenCalledWith({ kind: 'groceries', items: ['paper towels'] }))
    expect(FakeSocket.last!.sent).toEqual([])
  })
})
