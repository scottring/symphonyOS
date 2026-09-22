import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UnpromptedLines } from './UnpromptedLines'
import type { UnpromptedItem } from '@/hooks/useUnpromptedSuggestions'

const item = { suggestion: { id: 'suggestion', entityType: 'task', entityId: 'sleep', title: 'Call sleep study scheduler', actionType: 'call', actionPayload: { phoneNumber: '5550100' } } } as UnpromptedItem

describe('suggestion Add to today', () => {
  it('adds the existing task without invoking Call, snoozing, or treating the suggestion as performed', async () => {
    const onAct = vi.fn(), onSnooze = vi.fn(), onAddToToday = vi.fn().mockResolvedValue(true)
    render(<UnpromptedLines items={[item]} onAct={onAct} onSnooze={onSnooze} todayState={() => 'available'} onAddToToday={onAddToToday} />)
    expect(screen.getByRole('button', { name: 'Call' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to today' }))
    expect(await screen.findByText("On today's tasks")).toBeInTheDocument()
    expect(onAddToToday).toHaveBeenCalledWith(item)
    expect(onAct).not.toHaveBeenCalled()
    expect(onSnooze).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Add to today' })).toBeNull()
  })

  it('does not offer another placement for a task already on Today', () => {
    render(<UnpromptedLines items={[item]} onAct={vi.fn()} onSnooze={vi.fn()} todayState={() => 'added'} onAddToToday={vi.fn()} />)
    expect(screen.getByText("On today's tasks")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to today' })).toBeNull()
  })

  it('leaves suggestions without an eligible task unchanged', () => {
    render(<UnpromptedLines items={[item]} onAct={vi.fn()} onSnooze={vi.fn()} todayState={() => null} onAddToToday={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Add to today' })).toBeNull()
  })

  it.each([false, new Error('offline')])('keeps retry available after an unsuccessful save: %s', async (failure) => {
    const onAdd = vi.fn().mockImplementationOnce(() => failure instanceof Error ? Promise.reject(failure) : Promise.resolve(failure)).mockResolvedValue(true)
    render(<UnpromptedLines items={[item]} onAct={vi.fn()} onSnooze={vi.fn()} todayState={() => 'available'} onAddToToday={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to today' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add')
    fireEvent.click(screen.getByRole('button', { name: 'Add to today' }))
    await waitFor(() => expect(screen.getByText("On today's tasks")).toBeInTheDocument())
  })
})
