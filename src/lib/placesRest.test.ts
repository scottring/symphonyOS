import { describe, it, expect, vi, beforeEach } from 'vitest'
import { placesAutocomplete, placeDetails } from './placesRest'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

beforeEach(() => invoke.mockReset())

describe('placesAutocomplete', () => {
  it('maps proxy suggestions (structuredFormat nesting) and drops entries without a placeId', async () => {
    invoke.mockResolvedValue({
      data: {
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
      },
      error: null,
    })

    const results = await placesAutocomplete('guitar')
    expect(invoke).toHaveBeenCalledWith('places-proxy', {
      body: { action: 'autocomplete', input: 'guitar', includedPrimaryTypes: undefined },
    })
    expect(results).toEqual([
      {
        placeId: 'p1',
        description: 'The Guitar Shop, Route 9, Howell Township, NJ, USA',
        mainText: 'The Guitar Shop',
        secondaryText: 'Route 9, Howell Township, NJ, USA',
      },
    ])
  })

  it('passes includedPrimaryTypes through to the proxy', async () => {
    invoke.mockResolvedValue({ data: { suggestions: [] }, error: null })
    await placesAutocomplete('q', ['establishment'])
    expect(invoke).toHaveBeenCalledWith('places-proxy', {
      body: { action: 'autocomplete', input: 'q', includedPrimaryTypes: ['establishment'] },
    })
  })

  it('throws when the proxy returns an error', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(placesAutocomplete('q')).rejects.toThrow('boom')
  })
})

describe('placeDetails', () => {
  it('maps displayName/formattedAddress/phone', async () => {
    invoke.mockResolvedValue({
      data: {
        displayName: { text: 'The Guitar Shop' },
        formattedAddress: '123 Route 9, Howell Township, NJ',
        nationalPhoneNumber: '(555) 111-2222',
      },
      error: null,
    })
    const details = await placeDetails('p1')
    expect(invoke).toHaveBeenCalledWith('places-proxy', { body: { action: 'details', placeId: 'p1' } })
    expect(details).toEqual({
      name: 'The Guitar Shop',
      address: '123 Route 9, Howell Township, NJ',
      phone: '(555) 111-2222',
    })
  })
})
