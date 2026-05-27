import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// searchPlaces now goes through the REST helper (placesRest), not the Maps JS
// SDK's gRPC-web transport. Mock the helper and assert the hook delegates to it.
const placesAutocomplete = vi.fn(async () => [
  { placeId: 'p1', description: 'Wells Fargo, Philadelphia, PA', mainText: 'Wells Fargo', secondaryText: 'Philadelphia, PA' },
])

vi.mock('@/lib/placesRest', () => ({
  placesAutocomplete: (...args: unknown[]) => placesAutocomplete(...(args as [])),
  placeDetails: vi.fn(async () => null),
}))

vi.mock('@/lib/googleMaps', () => ({
  isGoogleMapsLoaded: () => false,
  getPlacesLibrary: () => null,
  getMapsLoadError: () => null,
  loadPlacesLibrary: vi.fn(async () => ({})),
}))

import { useDirections } from './useDirections'

describe('useDirections.searchPlaces (REST transport)', () => {
  it('delegates to the REST helper and returns mapped results', async () => {
    const { result } = renderHook(() => useDirections())
    const res = await result.current.searchPlaces('wel')
    expect(placesAutocomplete).toHaveBeenCalledWith('wel')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ placeId: 'p1', mainText: 'Wells Fargo', secondaryText: 'Philadelphia, PA' })
  })

  it('returns [] for a blank query without calling the helper', async () => {
    placesAutocomplete.mockClear()
    const { result } = renderHook(() => useDirections())
    expect(await result.current.searchPlaces('   ')).toEqual([])
    expect(placesAutocomplete).not.toHaveBeenCalled()
  })
})
