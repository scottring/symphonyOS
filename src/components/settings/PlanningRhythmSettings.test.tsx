import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const hh = vi.hoisted(() => ({ household: null as null | { weekStartsOn: 0 | 1 | 6; canEdit: boolean }, setWeekStart: vi.fn() }))
vi.mock('@/hooks/useHouseholdWeekStart', () => ({ useHouseholdWeekStart: () => hh }))
vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))

const { PlanningRhythmSettings } = await import('./PlanningRhythmSettings')

describe('PlanningRhythmSettings — when the week starts', () => {
  beforeEach(() => { localStorage.clear(); hh.household = null; hh.setWeekStart.mockReset() })

  it('offers Sunday, Monday and Saturday', () => {
    render(<PlanningRhythmSettings />)
    const group = screen.getByRole('group', { name: 'Week starts on' })
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Sunday', 'Monday', 'Saturday'])
  })

  it('in a household, the owner confirms, and the switch moves everyone’s weeks (one call)', async () => {
    hh.household = { weekStartsOn: 0, canEdit: true }
    hh.setWeekStart.mockResolvedValue({ ok: true, moved: 12 })
    render(<PlanningRhythmSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }))
    expect(hh.setWeekStart).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Saturday–Friday for your household/)
    fireEvent.click(screen.getByRole('button', { name: 'Start weeks on Saturday' }))
    await waitFor(() => expect(hh.setWeekStart).toHaveBeenCalledWith(6))
    expect(JSON.parse(localStorage.getItem('symphony-cadence-config') ?? '{}').weekStartsOn).toBeUndefined()
  })

  it('a member sees the household’s day and cannot change it', () => {
    hh.household = { weekStartsOn: 6, canEdit: false }
    render(<PlanningRhythmSettings />)
    expect(screen.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sunday' })).toBeDisabled()
    expect(screen.getByText('Set for your household by its owner')).toBeInTheDocument()
  })

  it('alone (no household), it stays this device’s choice', () => {
    render(<PlanningRhythmSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }))
    expect(JSON.parse(localStorage.getItem('symphony-cadence-config') ?? '{}').weekStartsOn).toBe(6)
  })
})
