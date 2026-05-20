/**
 * Resolves an event's `location` value into a clickable link.
 *
 * If the location is a fully-formed URL (http/https), the link should open the URL
 * directly — Zoom, Google Meet, Teams, generic web meetings, etc. Wrapping a
 * meeting URL in a Google Maps search yields nonsense ("get directions to
 * https://zoom.us/j/..."), so we pass URLs through unchanged.
 *
 * If the location is a physical address (no scheme), wrap it as a Google Maps
 * directions URL — using `place_id:` when a placeId is provided for accuracy.
 */
export type LocationLinkKind = 'url' | 'maps' | 'empty'

export interface LocationLinkResult {
  kind: LocationLinkKind
  href: string
}

const URL_RE = /^https?:\/\//i

export function locationLink(
  location: string | null | undefined,
  placeId?: string | null,
): LocationLinkResult {
  const trimmed = (location ?? '').trim()
  if (!trimmed) return { kind: 'empty', href: '' }

  if (URL_RE.test(trimmed)) {
    return { kind: 'url', href: trimmed }
  }

  const destination = placeId
    ? `place_id:${placeId}`
    : encodeURIComponent(trimmed)

  return {
    kind: 'maps',
    href: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
  }
}
