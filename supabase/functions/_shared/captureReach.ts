/** What a captured photo says to call or visit, made tappable.
 *
 *  Scott, 2026-10-04: a photo of a jury summons came back with the
 *  night-before confirmation number and website buried in the note as plain
 *  text. The capture now reads the same typed facets an attached photo gets
 *  (phone, link, datetime, location …); this module validates them and lifts
 *  the reachable ones onto the task — the first number into `phone_number`
 *  (the panel's call button, the card in the day list) and every website into
 *  `links`. Pure, so it is tested without Deno. */
import { parseFacets, type Facet } from './facets.ts'

export interface CaptureLink { url: string; title?: string }

/** A printed web address ("www.court.org", "ejury.mdcourts.gov/form") is a
 *  link even without a scheme; the facet validator wants one. */
function withScheme(url: unknown): unknown {
  if (typeof url !== 'string') return url
  const u = url.trim()
  if (/^https?:\/\//i.test(u)) return u
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u) ? `https://${u}` : u
}

export function parseCaptureFacets(raw: unknown): Facet[] {
  if (!Array.isArray(raw)) return parseFacets(raw ?? [])
  return parseFacets(raw.map((f) =>
    f && typeof f === 'object' && (f as { type?: unknown }).type === 'link'
      ? { ...(f as Record<string, unknown>), url: withScheme((f as { url?: unknown }).url) }
      : f,
  ))
}

/** The task patch: a number only when the task has none, links it lacks. */
export function reachFromFacets(
  facets: Facet[],
  // Older tasks hold links as bare URL strings; both shapes are kept as-is.
  current: { phone_number: string | null; links: (CaptureLink | string)[] | null },
): { phone_number?: string; links?: (CaptureLink | string)[] } {
  const patch: { phone_number?: string; links?: (CaptureLink | string)[] } = {}
  const phone = facets.find((f): f is Extract<Facet, { type: 'phone' }> => f.type === 'phone')
  if (phone && !current.phone_number?.trim()) patch.phone_number = phone.number

  const have = new Set((current.links ?? []).map((l) => (typeof l === 'string' ? l : l.url)))
  const added = facets
    .filter((f): f is Extract<Facet, { type: 'link' }> => f.type === 'link' && !have.has(f.url))
    .map((f) => (f.label ? { url: f.url, title: f.label } : { url: f.url }))
  if (added.length) patch.links = [...(current.links ?? []), ...added]
  return patch
}
