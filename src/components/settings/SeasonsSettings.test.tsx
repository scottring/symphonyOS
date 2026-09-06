import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'

const state = { seasons: DEFAULT_SEASONS as Seasons, loading: false, canEdit: true }
const mockSetSeasons = vi.fn(async (next: Seasons) => { state.seasons = next; return true })
vi.mock('@/hooks/useHouseholdSeasons', () => ({
  useHouseholdSeasons: () => ({ ...state, setSeasons: mockSetSeasons }),
}))

import { SeasonsSettings } from './SeasonsSettings'

describe('SeasonsSettings', () => {
  beforeEach(() => { state.seasons = DEFAULT_SEASONS; state.canEdit = true; mockSetSeasons.mockClear() })
  afterEach(() => { vi.useRealTimers() })

  it('renders the four seasons with their start dates', () => {
    render(<SeasonsSettings />)
    expect(screen.getByRole('heading', { name: 'Seasons' })).toBeInTheDocument()
    expect(screen.getByLabelText('Season 3 name')).toHaveValue('Fall')
    expect(screen.getByLabelText('Season 3 starts in')).toHaveValue('9')
    expect(screen.getByLabelText('Season 3 start day')).toHaveValue('1')
  })

  it('says which season today is in', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 5))
    render(<SeasonsSettings />)
    expect(screen.getByText(/Today is in Fall 2026/)).toBeInTheDocument()
  })

  it('changing a start month saves the whole config', () => {
    render(<SeasonsSettings />)
    fireEvent.change(screen.getByLabelText('Season 4 starts in'), { target: { value: '11' } })
    expect(mockSetSeasons).toHaveBeenCalledTimes(1)
    const next = mockSetSeasons.mock.calls[0][0]
    expect(next[3]).toEqual({ name: 'Winter', month: 11, day: 1 })
  })

  it('renaming saves on blur, not on every keystroke', () => {
    render(<SeasonsSettings />)
    const input = screen.getByLabelText('Season 1 name')
    fireEvent.change(input, { target: { value: 'Deep winter' } })
    expect(mockSetSeasons).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(mockSetSeasons).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Deep winter' })]))
  })

  it('a member sees the seasons read-only', () => {
    state.canEdit = false
    render(<SeasonsSettings />)
    expect(screen.queryByLabelText('Season 1 name')).not.toBeInTheDocument()
    expect(screen.getByText('Fall')).toBeInTheDocument()
    expect(screen.getByText(/Only the household owner/)).toBeInTheDocument()
  })
})
