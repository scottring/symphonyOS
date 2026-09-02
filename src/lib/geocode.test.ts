import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodeCandidates, geocodePlace, splitRegion } from './geocode'

afterEach(() => vi.unstubAllGlobals())

describe('geocodeCandidates', () => {
  it('passes a city or ZIP through', () => {
    expect(geocodeCandidates('Baltimore')).toEqual(['Baltimore'])
    expect(geocodeCandidates('21211')).toEqual(['21211'])
  })
  it('falls back from a street address to ZIP, then City, State, then City', () => {
    expect(geocodeCandidates('3600 Falls Rd, Baltimore, MD 21211')).toEqual([
      '3600 Falls Rd, Baltimore, MD 21211', '21211', 'Baltimore, MD', 'Baltimore',
    ])
  })
  it('returns nothing for blank input', () => {
    expect(geocodeCandidates('   ')).toEqual([])
  })
})

describe('splitRegion', () => {
  it('expands a two-letter US state', () => {
    expect(splitRegion('Portland, OR')).toEqual({ name: 'Portland', region: 'Oregon' })
    expect(splitRegion('Portland, me')).toEqual({ name: 'Portland', region: 'Maine' })
  })
  it('keeps a full region name and passes bare names through', () => {
    expect(splitRegion('Paris, Texas')).toEqual({ name: 'Paris', region: 'Texas' })
    expect(splitRegion('21211')).toEqual({ name: '21211', region: null })
  })
})

describe('geocodePlace', () => {
  it('picks the result in the named state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [
      { name: 'Portland', admin1: 'Oregon', latitude: 45.52, longitude: -122.68 },
      { name: 'Portland', admin1: 'Maine', latitude: 43.66, longitude: -70.26 },
    ] }) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await geocodePlace('Portland, ME')).toEqual({ lat: 43.66, lng: -70.26, label: 'Portland, Maine' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('name=Portland&count=10')
  })

  it('returns the first candidate that resolves, with a readable label', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ name: 'Baltimore', admin1: 'Maryland', latitude: 39.29, longitude: -76.61 }] }) })
    vi.stubGlobal('fetch', fetchMock)
    const hit = await geocodePlace('1 Main St, Baltimore, MD 21211')
    expect(hit).toEqual({ lat: 39.29, lng: -76.61, label: 'Baltimore, Maryland' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('name=21211')
  })
  it('returns null when nothing resolves', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    expect(await geocodePlace('zzzz')).toBeNull()
  })
})
