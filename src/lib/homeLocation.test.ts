import { describe, it, expect, beforeEach, vi } from 'vitest'

const getAuthUser = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getAuthUser: () => getAuthUser(),
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }),
    }),
  },
}))

import { getHomeLocation, readStoredHomeLocation, resetHomeLocationCache } from './homeLocation'

describe('homeLocation', () => {
  beforeEach(() => {
    localStorage.clear()
    resetHomeLocationCache()
    getAuthUser.mockReset()
    maybeSingle.mockReset()
    getAuthUser.mockResolvedValue({ data: { user: null } })
    maybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('reads the address the settings screen saved locally', () => {
    localStorage.setItem(
      'symphony_home_location',
      JSON.stringify({ name: 'Home', address: '100 Home St' }),
    )
    expect(readStoredHomeLocation()).toEqual({ address: '100 Home St', placeId: undefined })
  })

  it('ignores a corrupt storage entry', () => {
    localStorage.setItem('symphony_home_location', 'not json')
    expect(readStoredHomeLocation()).toBeNull()
  })

  it('falls back to the profile so a second device still gets travel times', async () => {
    getAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({
      data: { home_location: '200 Profile Ave', home_place_id: 'place-2' },
      error: null,
    })

    expect(await getHomeLocation()).toEqual({ address: '200 Profile Ave', placeId: 'place-2' })
  })

  it('prefers the local address and never queries for it', async () => {
    localStorage.setItem(
      'symphony_home_location',
      JSON.stringify({ name: 'Home', address: '100 Home St' }),
    )

    expect(await getHomeLocation()).toEqual({ address: '100 Home St', placeId: undefined })
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('looks the profile up once however many rows ask', async () => {
    getAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({ data: { home_location: '200 Profile Ave' }, error: null })

    await Promise.all([getHomeLocation(), getHomeLocation()])
    await getHomeLocation()

    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('returns null when no home address is set anywhere', async () => {
    expect(await getHomeLocation()).toBeNull()
  })

  it('survives a query that throws', async () => {
    getAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockRejectedValue(new Error('offline'))

    expect(await getHomeLocation()).toBeNull()
  })
})
