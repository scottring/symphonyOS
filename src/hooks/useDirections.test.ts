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

describe('useDirections.buildMapsUrl origin handling', () => {
  const ctx = (originAddress: string) => ({
    origin: { id: 'origin', name: 'Home', address: originAddress, order: 0 },
    destination: { id: 'destination', name: 'Dest', address: '3806 Tudor Arms Ave, Baltimore, MD', order: 999 },
    stops: [],
    travelMode: 'driving' as const,
  })

  it('includes origin when a real starting address is set', () => {
    const { result } = renderHook(() => useDirections())
    const url = result.current.buildMapsUrl(ctx('123 Real St, Town, ST'))
    expect(url).toContain('origin=123%20Real%20St')
    expect(url).toContain('destination=3806%20Tudor%20Arms')
  })

  it('omits origin for the placeholder so Maps uses current location', () => {
    const { result } = renderHook(() => useDirections())
    const url = result.current.buildMapsUrl(ctx('Tap to set your starting address'))
    expect(url).not.toContain('origin=')
    expect(url).toContain('destination=3806%20Tudor%20Arms')
    expect(url).toContain('travelmode=driving')
  })
})
