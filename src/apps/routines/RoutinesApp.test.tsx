import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { ConversationWalkContext } from '@/components/canvas/conversationWalk'
import { RoutinesApp } from './RoutinesApp'

vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ routines: [], addRoutine: vi.fn(), updateRoutine: vi.fn(), deleteRoutine: vi.fn(), loading: false }) }))
vi.mock('@/hooks/useContacts', () => ({ useContacts: () => ({ contacts: [] }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({}) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ soleDomain: null, layers: [], all: vi.fn() }) }))
vi.mock('@/components/lazy', () => ({
  RoutinesList: ({ onBuildWithAI }: { onBuildWithAI?: () => void }) => onBuildWithAI ? <button type="button" onClick={onBuildWithAI}>Build with Symphony</button> : <p>No builder button</p>,
  RoutineForm: () => null,
  RoutineInput: () => null,
}))

const open = (setWalk: ((w: unknown) => void) | null) => render(
  <ConversationWalkContext.Provider value={setWalk}>
    <MemoryRouter initialEntries={['/routines']}><Routes><Route path="/routines/*" element={<RoutinesApp />} /></Routes></MemoryRouter>
  </ConversationWalkContext.Provider>,
)

describe('building a routine (approved Routines board, 2026-10-10)', () => {
  it('builds in the docked bar on desktop, asking rather than adding steps', async () => {
    const setWalk = vi.fn()
    open(setWalk)
    expect(await screen.findByText('No builder button')).toBeInTheDocument()
    expect(setWalk).toHaveBeenLastCalledWith({ label: 'Build a routine with me', message: expect.stringContaining("don't add steps of your own") })
  })

  it('keeps the builder where there is no bar (phones)', async () => {
    open(null)
    expect(await screen.findByRole('button', { name: 'Build with Symphony' })).toBeInTheDocument()
  })
})
