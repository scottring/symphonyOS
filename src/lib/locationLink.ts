/**
 * Resolves an event's `location` value into a clickable link.
 *
 * Precedence:
 * 1. A meeting URL embedded ANYWHERE in the location text (e.g.
 *    "Microsoft Teams Meeting https://teams.microsoft.com/...") opens directly.
 * 2. A virtual-meeting LABEL with no URL ("Microsoft Teams Meeting", "Zoom
 *    Meeting", "Google Meet") is treated as virtual: if a separate `meetingUrl`
 *    is known (Google often stores the Teams join link in conferenceData, not
 *    the location), link to it; otherwise it's a non-destination label.
 * 3. Anything else is a physical address → Google Maps directions.
 *
 * The point: a video meeting must never render as a physical address. Wrapping
 * "Microsoft Teams Meeting" in a Maps directions URL ("get directions to
 * Microsoft Teams Meeting") is the bug this guards against.
 */
export type LocationLinkKind = 'url' | 'maps' | 'virtual' | 'empty'

export interface LocationLinkResult {
  kind: LocationLinkKind
  href: string
}

const URL_AT_START_RE = /^https?:\/\//i
const URL_ANYWHERE_RE = /https?:\/\/[^\s<>"')]+/i

// Unambiguous virtual-meeting markers. Kept specific (e.g. "teams meeting",
// not bare "teams") so a physical address like "123 Teams Drive" isn't caught.
const VIRTUAL_RE =
  /(microsoft\s*teams|teams\s*meeting|zoom\.us|zoom\s*meeting|meet\.google|google\s*meet|webex|gotomeet(?:ing)?|goto\s*meeting|bluejeans|whereby|skype\s*meeting|online\s*meeting|virtual\s*meeting|video\s*call|join\s*(?:the\s*)?meeting)/i

export function locationLink(
  location: string | null | undefined,
  placeId?: string | null,
  meetingUrl?: string | null,
): LocationLinkResult {
  const trimmed = (location ?? '').trim()
  if (!trimmed) return { kind: 'empty', href: '' }

  // 1. A URL anywhere in the location wins (covers bare URLs and label+URL).
  const embedded = trimmed.match(URL_ANYWHERE_RE)?.[0]
  if (embedded) return { kind: 'url', href: embedded }

  // 2. A virtual-meeting label with no URL: prefer the event's known join URL.
  if (VIRTUAL_RE.test(trimmed)) {
    const mu = (meetingUrl ?? '').trim()
    if (mu && URL_AT_START_RE.test(mu)) return { kind: 'url', href: mu }
    return { kind: 'virtual', href: '' }
  }

  // 3. Physical address → Maps directions.
  const destination = placeId ? `place_id:${placeId}` : encodeURIComponent(trimmed)
  return {
    kind: 'maps',
    href: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
  }
}
