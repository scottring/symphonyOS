import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// SDK reports as NOT preloaded, so the hook must await loadPlacesLibrary
// inside searchPlaces (the race that previously yielded "No places found").
const fetchAutocompleteSuggestions = vi.fn(async () => ({
  suggestions: [
    {
      placePrediction: {
        placeId: 'p1',
        text: { text: 'Wells Fargo, Philadelphia, PA' },
        mainText: { text: 'Wells Fargo' },
        secondaryText: { text: 'Philadelphia, PA' },
      },
    },
  ],
}))

vi.mock('@/lib/googleMaps', () => ({
  isGoogleMapsLoaded: () => false,
  getPlacesLibrary: () => null,
  getMapsLoadError: () => null,
  loadPlacesLibrary: vi.fn(async () => ({
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    Place: class {},
  })),
}))

import { useDirections } from './useDirections'

describe('useDirections.searchPlaces (SDK readiness race)', () => {
  it('awaits the Places library and returns mapped results even when not preloaded', async () => {
    const { result } = renderHook(() => useDirections())
    const res = await result.current.searchPlaces('wel')
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({ input: 'wel' })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ placeId: 'p1', mainText: 'Wells Fargo', secondaryText: 'Philadelphia, PA' })
  })

  it('returns [] for a blank query', async () => {
    const { result } = renderHook(() => useDirections())
    expect(await result.current.searchPlaces('   ')).toEqual([])
  })
})
