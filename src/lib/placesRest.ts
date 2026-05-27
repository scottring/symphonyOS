/**
 * Places API (New) over plain REST + fetch.
 *
 * Why not the Maps JS SDK (`AutocompleteSuggestion`)? Its autocomplete travels
 * over a gRPC-web transport (`places.googleapis.com/$rpc/.../AutocompletePlaces`)
 * that fails on some devices/networks ("Rpc failed due to xhr error") — content
 * blockers and proxies routinely break the binary RPC while leaving the plain
 * JSON REST endpoint working. REST is CORS-enabled for browser keys and is what
 * we verified works from the production origin, so we use it directly.
 */
import type { PlaceAutocompleteResult } from '@/types/directions'

const BASE = 'https://places.googleapis.com/v1'

function apiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Maps API key is missing from this build (VITE_GOOGLE_MAPS_API_KEY).')
  return key
}

interface RestText {
  text?: string
}
interface RestPlacePrediction {
  placeId?: string
  text?: RestText
  structuredFormat?: { mainText?: RestText; secondaryText?: RestText }
}
interface RestAutocompleteResponse {
  suggestions?: Array<{ placePrediction?: RestPlacePrediction }>
}
interface RestPlaceDetails {
  displayName?: RestText
  formattedAddress?: string
  nationalPhoneNumber?: string
}

/**
 * Autocomplete place predictions for `input`.
 * @param includedPrimaryTypes optional type filter (e.g. ['establishment']).
 */
export async function placesAutocomplete(
  input: string,
  includedPrimaryTypes?: string[],
): Promise<PlaceAutocompleteResult[]> {
  const body: Record<string, unknown> = { input }
  if (includedPrimaryTypes && includedPrimaryTypes.length > 0) {
    body.includedPrimaryTypes = includedPrimaryTypes
  }

  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Places autocomplete failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const data = (await res.json()) as RestAutocompleteResponse
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is RestPlacePrediction => Boolean(p && p.placeId))
    .map((p) => ({
      placeId: p.placeId ?? '',
      description: p.text?.text ?? '',
      // REST nests the two-line format under structuredFormat (the JS SDK flattened it).
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
    }))
}

/** Fetch display name + address (+ phone) for a place id. */
export async function placeDetails(
  placeId: string,
): Promise<{ name: string; address: string; phone?: string } | null> {
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber',
    },
  })
  if (!res.ok) {
    throw new Error(`Place details failed (HTTP ${res.status})`)
  }
  const data = (await res.json()) as RestPlaceDetails
  return {
    name: data.displayName?.text ?? '',
    address: data.formattedAddress ?? '',
    phone: data.nationalPhoneNumber ?? undefined,
  }
}
