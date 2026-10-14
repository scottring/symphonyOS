import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { ConversationWalkContext } from '@/components/canvas/conversationWalk'
import { RoutinesApp } from './RoutinesApp'

const { openAssistant } = vi.hoisted(() => ({ openAssistant: vi.fn() }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ routines: [], addRoutine: vi.fn(), updateRoutine: vi.fn(), deleteRoutine: vi.fn(), loading: false }) }))
vi.mock('@/hooks/useContacts', () => ({ useContacts: () => ({ contacts: [] }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({}) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ soleDomain: null, layers: new Set(), all: vi.fn() }) }))
vi.mock('@/contexts/AssistantLaunchContext', () => ({ useAssistantLauncher: () => ({ openAssistant }) }))
vi.mock('@/components/lazy', () => ({
  RoutinesList: ({ walk }: { walk?: { label: string; onStart: () => void } }) => walk ? <button type="button" onClick={walk.onStart}>{walk.label}</button> : <p>No page walk</p>,
  RoutineForm: () => null,
  RoutineInput: () => null,
}))

const open = (setWalk: ((w: unknown) => void) | null) => render(
  <ConversationWalkContext.Provider value={setWalk}>
    <MemoryRouter initialEntries={['/routines']}><Routes><Route path="/routines/*" element={<RoutinesApp />} /></Routes></MemoryRouter>
  </ConversationWalkContext.Provider>,
)

describe('changing routines is a conversation (spec 2026-10-14)', () => {
  it('offers "Change our routines" in the bar, reading the week first', async () => {
    const setWalk = vi.fn()
    open(setWalk)
    expect(await screen.findByText('No page walk')).toBeInTheDocument()
    expect(setWalk).toHaveBeenLastCalledWith({ label: 'Change our routines', message: expect.stringContaining('symphony_read_week') })
  })

  it('offers the same walk on the page where there is no bar (phones)', async () => {
    open(null)
    fireEvent.click(await screen.findByRole('button', { name: 'Change our routines' }))
    expect(openAssistant).toHaveBeenCalledWith({ message: expect.stringContaining("Let's change our routines"), autoSend: true })
  })
})
