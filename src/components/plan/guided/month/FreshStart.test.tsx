import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const place = vi.hoisted(() => ({ place: 'cabin', setPlace: vi.fn() }))
vi.mock('@/hooks/usePlace', async (importOriginal) => ({ ...await importOriginal<object>(), usePlace: () => place }))

import { FreshStart } from './FreshStart'

beforeEach(() => { place.setPlace.mockClear(); place.place = 'cabin' })

describe('FreshStart — the month’s scenery', () => {
  it('picking a place changes the app’s scenery and saves it as this month’s choice', async () => {
    const patch = vi.fn(async () => true)
    render(<FreshStart monthWord="November" patch={patch} />)
    // Compact: the places only, none of Settings' display options.
    expect(screen.queryByRole('combobox', { name: 'Lighting' })).toBeNull()
    expect(screen.getByRole('button', { name: /Woodsy Cabin/ })).toHaveAttribute('aria-pressed', 'true')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Densely Urban/ })) })
    expect(place.setPlace).toHaveBeenCalledWith('urban')
    expect(patch).toHaveBeenCalledWith({ scenery: 'urban' })
    expect(screen.getByText(/The wall keeps its own/)).toBeInTheDocument()
  })

  it('names what was picked for the month, and says when it did not save', async () => {
    const patch = vi.fn(async () => false)
    render(<FreshStart monthWord="November" value="farm" patch={patch} />)
    expect(screen.getByText(/Picked for November:/)).toHaveTextContent('Farm')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Densely Urban/ })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save. Try again.')
  })
})
