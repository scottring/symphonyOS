import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PlaceSelection } from '@/components/location/PlacesAutocomplete'

const upsert = vi.fn()
const update = vi.fn()
const eq = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: (...args: unknown[]) => { upsert(...args); return Promise.resolve({ error: null }) },
      update: (...args: unknown[]) => { update(...args); return { eq: (...e: unknown[]) => { eq(...e); return Promise.resolve({ error: null }) } } },
    }),
  },
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('@/lib/geocode', () => ({ geocodePlace: vi.fn().mockResolvedValue({ lat: 39.3, lng: -76.6 }) }))
vi.mock('@/hooks/useWeather', () => ({ setHomeCoords: vi.fn() }))
vi.mock('@/hooks/useDirections', () => ({
  useDirections: () => ({
    searchPlaces: vi.fn().mockResolvedValue([]),
    getPlaceDetails: vi.fn().mockResolvedValue(null),
    placesError: null,
  }),
}))

// The autocomplete itself is covered by PlacesAutocomplete.test.tsx; here it
// stands in as a button that reports one selection, so the test is about what
// Settings does with the place it gets back.
const PLACE: PlaceSelection = {
  name: 'Home',
  address: '100 Home St, Baltimore, MD 21211, USA',
  placeId: 'place-home-1',
}
vi.mock('@/components/location/PlacesAutocomplete', () => ({
  PlacesAutocomplete: ({ onSelect }: { onSelect: (p: PlaceSelection) => void }) => (
    <button onClick={() => onSelect(PLACE)}>pick-place</button>
  ),
}))

import { HomeAddressSettings } from './HomeAddressSettings'

const STORAGE_KEY = 'symphony_home_location'
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')

describe('HomeAddressSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    upsert.mockReset()
    update.mockReset()
    eq.mockReset()
  })

  it('saves the place id alongside the address when a place is picked', async () => {
    render(<HomeAddressSettings />)
    fireEvent.click(screen.getByText('Set home address'))
    fireEvent.click(screen.getByText('pick-place'))

    expect(stored()).toEqual({ name: 'Home', address: PLACE.address, placeId: PLACE.placeId })
    await waitFor(() => expect(upsert).toHaveBeenCalled())
    expect(upsert.mock.calls[0][0]).toMatchObject({
      user_id: 'user-1',
      home_location: PLACE.address,
      home_place_id: PLACE.placeId,
    })
  })

  it('shows the chosen address once saved', async () => {
    render(<HomeAddressSettings />)
    fireEvent.click(screen.getByText('Set home address'))
    fireEvent.click(screen.getByText('pick-place'))

    expect(await screen.findByText(PLACE.address)).toBeInTheDocument()
  })

  it('still accepts a typed address when Places is unavailable', async () => {
    render(<HomeAddressSettings />)
    fireEvent.click(screen.getByText('Set home address'))
    fireEvent.click(screen.getByText(/enter it manually/i))

    fireEvent.change(screen.getByPlaceholderText(/enter your home address/i), {
      target: { value: '200 Typed Ave' },
    })
    fireEvent.click(screen.getByText('Save'))

    expect(stored()).toMatchObject({ address: '200 Typed Ave' })
    await waitFor(() => expect(upsert).toHaveBeenCalled())
    expect(upsert.mock.calls[0][0]).toMatchObject({
      home_location: '200 Typed Ave',
      home_place_id: null,
    })
  })

  it('clears both the address and the place id', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: 'Home', address: PLACE.address, placeId: PLACE.placeId }),
    )
    render(<HomeAddressSettings />)

    fireEvent.click(await screen.findByTitle('Remove'))

    expect(stored()).toBeNull()
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][0]).toMatchObject({ home_location: null, home_place_id: null })
  })
})
