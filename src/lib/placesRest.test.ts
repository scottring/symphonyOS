import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { placesAutocomplete, placeDetails } from './placesRest'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('placesAutocomplete', () => {
  it('maps REST suggestions (structuredFormat nesting) and drops entries without a placeId', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: 'p1',
              text: { text: 'The Guitar Shop, Route 9, Howell Township, NJ, USA' },
              structuredFormat: {
                mainText: { text: 'The Guitar Shop' },
                secondaryText: { text: 'Route 9, Howell Township, NJ, USA' },
              },
            },
          },
          { queryPrediction: { text: { text: 'no place id here' } } },
        ],
      }),
    )

    const results = await placesAutocomplete('guitar')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      placeId: 'p1',
      description: 'The Guitar Shop, Route 9, Howell Township, NJ, USA',
      mainText: 'The Guitar Shop',
      secondaryText: 'Route 9, Howell Township, NJ, USA',
    })
  })

  it('sends includedPrimaryTypes only when provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ suggestions: [] }))
    await placesAutocomplete('q', ['establishment'])
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ input: 'q', includedPrimaryTypes: ['establishment'] })

    fetchMock.mockResolvedValue(jsonResponse({ suggestions: [] }))
    await placesAutocomplete('q')
    const body2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(body2).toEqual({ input: 'q' })
  })

  it('throws with the HTTP status when the request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, false, 403))
    await expect(placesAutocomplete('q')).rejects.toThrow(/403/)
  })
})

describe('placeDetails', () => {
  it('maps displayName/formattedAddress/phone', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        displayName: { text: 'The Guitar Shop' },
        formattedAddress: '123 Route 9, Howell Township, NJ',
        nationalPhoneNumber: '(555) 111-2222',
      }),
    )
    const details = await placeDetails('p1')
    expect(details).toEqual({
      name: 'The Guitar Shop',
      address: '123 Route 9, Howell Township, NJ',
      phone: '(555) 111-2222',
    })
  })
})
