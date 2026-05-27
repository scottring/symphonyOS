/**
 * Places API (New) via our own Supabase edge function ('places-proxy').
 *
 * We do NOT call places.googleapis.com from the browser — neither the Maps JS
 * SDK's gRPC-web transport ("Rpc failed due to xhr error") nor a plain REST
 * fetch ("Load failed") survives on some devices/networks (content blockers,
 * iCloud Private Relay, DNS filters that block googleapis.com). The edge
 * function calls Google server-side, so the browser only ever talks to our own
 * Supabase domain — the same channel that already loads the user's data.
 */
import { supabase } from '@/lib/supabase'
import type { PlaceAutocompleteResult } from '@/types/directions'

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
  const { data, error } = await supabase.functions.invoke<RestAutocompleteResponse>('places-proxy', {
    body: { action: 'autocomplete', input, includedPrimaryTypes },
  })
  if (error) throw new Error(error.message || 'Place lookup failed')

  return (data?.suggestions ?? [])
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
  const { data, error } = await supabase.functions.invoke<RestPlaceDetails>('places-proxy', {
    body: { action: 'details', placeId },
  })
  if (error) throw new Error(error.message || 'Place details failed')
  if (!data) return null
  return {
    name: data.displayName?.text ?? '',
    address: data.formattedAddress ?? '',
    phone: data.nationalPhoneNumber ?? undefined,
  }
}
