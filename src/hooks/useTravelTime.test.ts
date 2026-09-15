import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const getHomeLocation = vi.fn()
const getTravelEstimate = vi.fn()

vi.mock('@/lib/homeLocation', () => ({
  getHomeLocation: () => getHomeLocation(),
}))

vi.mock('@/lib/travelTime', async () => {
  const actual = await vi.importActual<typeof import('@/lib/travelTime')>('@/lib/travelTime')
  return { ...actual, getTravelEstimate: (...args: unknown[]) => getTravelEstimate(...args) }
})

import { useTravelTime } from './useTravelTime'

const HOME = { address: '100 Home St, Baltimore MD' }
const GYM = '1400 Coppermine Terr, Baltimore MD'

describe('useTravelTime', () => {
  beforeEach(() => {
    getHomeLocation.mockReset()
    getTravelEstimate.mockReset()
    getHomeLocation.mockResolvedValue(HOME)
    getTravelEstimate.mockResolvedValue({ durationSeconds: 1080, distanceMeters: 7400 })
  })

  it('labels the drive from home to a physical address', async () => {
    const { result } = renderHook(() => useTravelTime({ location: GYM }))

    await waitFor(() => expect(result.current).toBe('18 min drive'))
    expect(getTravelEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ origin: HOME.address, destination: GYM, mode: 'driving' }),
    )
  })

  it('passes the place id through so the route is exact', async () => {
    renderHook(() => useTravelTime({ location: GYM, locationPlaceId: 'place-1' }))

    await waitFor(() =>
      expect(getTravelEstimate).toHaveBeenCalledWith(
        expect.objectContaining({ destinationPlaceId: 'place-1' }),
      ),
    )
  })

  it('stays silent for a video meeting', async () => {
    const { result } = renderHook(() => useTravelTime({ location: 'https://zoom.us/j/123' }))

    await waitFor(() => expect(getTravelEstimate).not.toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('stays silent when no home address is set', async () => {
    getHomeLocation.mockResolvedValue(null)

    const { result } = renderHook(() => useTravelTime({ location: GYM }))

    await waitFor(() => expect(getHomeLocation).toHaveBeenCalled())
    expect(getTravelEstimate).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('stays silent when the item is at home', async () => {
    const { result } = renderHook(() => useTravelTime({ location: '  100 home st, baltimore md ' }))

    await waitFor(() => expect(getHomeLocation).toHaveBeenCalled())
    expect(getTravelEstimate).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('does nothing when disabled', async () => {
    const { result } = renderHook(() => useTravelTime({ location: GYM }, { enabled: false }))

    await waitFor(() => expect(result.current).toBeNull())
    expect(getHomeLocation).not.toHaveBeenCalled()
  })

  it('stays silent when the estimate is unavailable', async () => {
    getTravelEstimate.mockResolvedValue(null)

    const { result } = renderHook(() => useTravelTime({ location: GYM }))

    await waitFor(() => expect(getTravelEstimate).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
