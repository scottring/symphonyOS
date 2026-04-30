/**
 * Parse an ISO 8601 PT-format duration string ("PT1H30M") to integer minutes.
 * Also accepts bare numeric strings as already-minutes.
 * Returns null for empty / unparseable input.
 */
export function parseDurationToMinutes(input: string): number | null {
  if (!input || typeof input !== 'string') return null

  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10)
  }

  const match = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!match) return null

  const hours = match[1] ? parseInt(match[1], 10) : 0
  const minutes = match[2] ? parseInt(match[2], 10) : 0

  if (hours === 0 && minutes === 0) return null
  return hours * 60 + minutes
}
