import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
// One user object, as the real useAuth keeps it (sameUser) between renders.
const user = vi.hoisted(() => ({ id: 'u1' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user }) }))
vi.unmock('@/hooks/useWeather')

import { useWeather } from './useWeather'
import { WEATHER_COORDS_KEY } from '@/components/place/sceneryLighting'

const forecast = {
  current: { temperature_2m: 61, weather_code: 1 },
  hourly: { time: [], temperature_2m: [], weather_code: [] },
  daily: { time: ['2026-10-19'], temperature_2m_max: [66], temperature_2m_min: [48], weather_code: [1] },
}

describe('useWeather — one forecast call however many places show it', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(WEATHER_COORDS_KEY, JSON.stringify({ lat: 39.3, lng: -76.6 }))
  })

  it('three mounts at once make one call, and all three show it', async () => {
    let resolve: (v: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolve = r }))
    vi.stubGlobal('fetch', fetchMock)
    const hooks = [1, 2, 3].map(() => renderHook(() => useWeather()))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    resolve(new Response(JSON.stringify(forecast), { status: 200 }))
    for (const h of hooks) await waitFor(() => expect(h.result.current.weather?.currentTemp).toBe(61))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
