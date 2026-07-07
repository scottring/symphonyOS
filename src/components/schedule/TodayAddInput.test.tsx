// src/components/schedule/TodayAddInput.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const openAssistant = vi.fn()
vi.mock('@/contexts/AssistantLaunchContext', () => ({
  useAssistantLauncher: () => ({ openAssistant }),
}))

import { TodayAddInput, type TodayCaptureResult } from './TodayAddInput'

const parserContext = {
  projects: [],
  contacts: [{ id: 'c1', name: 'Macmillan Guitars' }],
  familyMembers: [],
}
const resolver = {
  contacts: [{ id: 'c1', name: 'Macmillan Guitars', phone: '410-555-0142' }],
  aliases: [],
}

function setup(onAdd = vi.fn<(r: TodayCaptureResult) => void>()) {
  render(
    <TodayAddInput
      onAdd={onAdd}
      parserContext={parserContext}
      currentDomain="personal"
      resolver={resolver}
      getRecentTaskForContact={(id) =>
        id === 'c1' ? { title: 'guitar repair follow-up', date: new Date('2026-05-26') } : null}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /add to today/i }))
  return { input: screen.getByPlaceholderText('Add to today...'), onAdd }
}

describe('TodayAddInput smart capture', () => {
  it('shows a pre-applied suggestion with phone and last-task context', async () => {
    vi.useFakeTimers()
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(screen.getByText(/Macmillan Guitars/)).toBeInTheDocument()
    expect(screen.getByText(/410-555-0142/)).toBeInTheDocument()
    expect(screen.getByText(/guitar repair follow-up/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('Enter submits with the suggested contact linked and phone attached', async () => {
    vi.useFakeTimers()
    const { input, onAdd } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
    const r = onAdd.mock.calls[0][0]
    expect(r.contactId).toBe('c1')
    expect(r.phoneNumber).toBe('410-555-0142')
    expect(r.resolution?.action).toBe('auto_applied')
    vi.useRealTimers()
  })

  it('unlinking via the × dismisses, and submit reports dismissed', async () => {
    vi.useFakeTimers()
    const { input, onAdd } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.click(screen.getByRole('button', { name: /unlink suggestion/i }))
    fireEvent.keyDown(input, { key: 'Enter' })
    const r = onAdd.mock.calls[0][0]
    expect(r.contactId).toBeUndefined()
    expect(r.phoneNumber).toBeUndefined()
    expect(r.resolution?.action).toBe('dismissed')
    vi.useRealTimers()
  })

  it('Esc dismisses the suggestion first, then clears the input', async () => {
    vi.useFakeTimers()
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'Call Macmillan Guitars' } })
    await act(() => vi.advanceTimersByTimeAsync(200))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText(/410-555-0142/)).not.toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('Call Macmillan Guitars')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Add to today...')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('plain text with no match submits exactly as before', () => {
    const { input, onAdd } = setup()
    fireEvent.change(input, { target: { value: 'Buy milk' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const r = onAdd.mock.calls[0][0]
    expect(r.title).toBe('Buy milk')
    expect(r.contactId).toBeUndefined()
    expect(r.resolution).toBeUndefined()
  })

  describe('destination chips', () => {
    it('defaults to today', () => {
      const { input, onAdd } = setup()
      fireEvent.change(input, { target: { value: 'Buy milk' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onAdd.mock.calls[0][0].destination).toBe('today')
    })

    it('Inbox chip routes the capture to the inbox and updates the placeholder', () => {
      const { input, onAdd } = setup()
      fireEvent.click(screen.getByRole('radio', { name: 'Inbox' }))
      expect(screen.getByPlaceholderText(/capture to inbox/i)).toBeInTheDocument()
      fireEvent.change(input, { target: { value: 'Research summer camps' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      const r = onAdd.mock.calls[0][0]
      expect(r.destination).toBe('inbox')
      expect(r.title).toBe('Research summer camps')
    })

    it('Note chip routes to a note', () => {
      const { input, onAdd } = setup()
      fireEvent.click(screen.getByRole('radio', { name: 'Note' }))
      fireEvent.change(input, { target: { value: 'Mia liked the blue paint sample' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onAdd.mock.calls[0][0].destination).toBe('note')
    })

    it('destination resets to today after submit', () => {
      const { input, onAdd } = setup()
      fireEvent.click(screen.getByRole('radio', { name: 'Inbox' }))
      fireEvent.change(input, { target: { value: 'one' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // Re-expand (submit collapses the input)
      fireEvent.click(screen.getByRole('button', { name: /add to today/i }))
      expect(screen.getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'true')
      expect(onAdd.mock.calls[0][0].destination).toBe('inbox')
    })
  })

  describe('Symphony escalation', () => {
    it('offers "Set this up with Symphony" while typing and launches with the text', () => {
      const { input, onAdd } = setup()
      expect(screen.queryByRole('button', { name: /Set this up with Symphony/ })).not.toBeInTheDocument()
      fireEvent.change(input, { target: { value: 'plan the school fundraiser' } })
      fireEvent.click(screen.getByRole('button', { name: /Set this up with Symphony/ }))
      expect(openAssistant).toHaveBeenCalledWith({
        message: 'Set this up and schedule it for today: plan the school fundraiser',
        autoSend: true,
      })
      // Escalation hands off — nothing is added locally, input resets.
      expect(onAdd).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /add to today/i })).toBeInTheDocument()
    })
  })
})
