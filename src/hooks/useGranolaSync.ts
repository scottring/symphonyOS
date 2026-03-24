import { useState, useEffect, useCallback, useRef } from 'react'

// ============================================================================
// Types — matches Open Brain's /api/meetings response
// ============================================================================

interface GranolaAttendee {
  name: string
  email: string
  title?: string
  company?: string
}

interface GranolaMeetingListItem {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  attendees: GranolaAttendee[]
  startTime?: string
  endTime?: string
  hasNotes: boolean
  hasTranscript: boolean
  savedToVault: boolean
}

export interface GranolaMeetingDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  notesMarkdown: string
  notesPlain: string
  overview: string | null
  summary: string | null
  transcript: string[]
  people: {
    creator: { name: string; email: string } | null
    attendees: {
      name: string
      email: string
      details?: {
        person?: {
          employment?: { title?: string; name?: string }
          linkedin?: { handle?: string }
        }
        company?: { name?: string }
      }
    }[]
  }
  markdown: string
}

// ============================================================================
// Config
// ============================================================================

const OPEN_BRAIN_URL = 'http://localhost:3001'
const POLL_INTERVAL_MS = 5000 // Poll every 5 seconds for live transcript updates

// ============================================================================
// Hook
// ============================================================================

/**
 * Syncs with Granola via Open Brain's local server.
 * Matches a Symphony meeting to a Granola meeting by calendar event title
 * and time overlap, then polls for transcript/notes updates.
 */
export function useGranolaSync(
  meetingTitle: string | null,
  meetingStartTime?: Date,
) {
  const [available, setAvailable] = useState<boolean | null>(null) // null = checking
  const [granolaMatch, setGranolaMatch] = useState<GranolaMeetingDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const matchedIdRef = useRef<string | null>(null)

  // Check if Open Brain is running
  const checkAvailability = useCallback(async () => {
    try {
      const res = await fetch(`${OPEN_BRAIN_URL}/api/meetings`, {
        signal: AbortSignal.timeout(2000),
      })
      setAvailable(res.ok)
      return res.ok
    } catch {
      setAvailable(false)
      return false
    }
  }, [])

  // Find matching Granola meeting by title similarity + time overlap
  const findMatch = useCallback(
    async (): Promise<string | null> => {
      if (!meetingTitle) return null

      try {
        const res = await fetch(`${OPEN_BRAIN_URL}/api/meetings`)
        if (!res.ok) return null

        const data = (await res.json()) as { meetings: GranolaMeetingListItem[] }
        const titleLower = meetingTitle.toLowerCase().trim()

        // Score each meeting by title match + time proximity
        let bestMatch: GranolaMeetingListItem | null = null
        let bestScore = 0

        for (const m of data.meetings) {
          let score = 0
          const mTitle = m.title.toLowerCase().trim()

          // Exact title match
          if (mTitle === titleLower) {
            score += 10
          }
          // Title contains
          else if (mTitle.includes(titleLower) || titleLower.includes(mTitle)) {
            score += 5
          }
          // Word overlap
          else {
            const meetingWords = new Set(titleLower.split(/\s+/))
            const granolaWords = mTitle.split(/\s+/)
            const overlap = granolaWords.filter((w) => meetingWords.has(w)).length
            score += overlap
          }

          // Time proximity bonus (within 30 minutes of start time)
          if (meetingStartTime && m.startTime) {
            const diff = Math.abs(
              new Date(m.startTime).getTime() - meetingStartTime.getTime()
            )
            if (diff < 30 * 60 * 1000) {
              score += 8 // Strong time match
            } else if (diff < 2 * 60 * 60 * 1000) {
              score += 3 // Same general time
            }
          }

          // Prefer meetings with content
          if (m.hasTranscript) score += 2
          if (m.hasNotes) score += 1

          if (score > bestScore) {
            bestScore = score
            bestMatch = m
          }
        }

        // Require at least some match (title word overlap + time)
        return bestScore >= 3 ? bestMatch?.id ?? null : null
      } catch {
        return null
      }
    },
    [meetingTitle, meetingStartTime]
  )

  // Fetch full meeting detail from Granola
  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${OPEN_BRAIN_URL}/api/meetings/${id}`)
      if (!res.ok) return null
      return (await res.json()) as GranolaMeetingDetail
    } catch {
      return null
    }
  }, [])

  // Poll for updates to the matched meeting
  const pollForUpdates = useCallback(async () => {
    const id = matchedIdRef.current
    if (!id) return

    const detail = await fetchDetail(id)
    if (detail) {
      setGranolaMatch(detail)
    }
  }, [fetchDetail])

  // Start syncing when meeting title is provided
  useEffect(() => {
    if (!meetingTitle) {
      setGranolaMatch(null)
      matchedIdRef.current = null
      return
    }

    let cancelled = false

    async function init() {
      setLoading(true)
      const isAvailable = await checkAvailability()
      if (!isAvailable || cancelled) {
        setLoading(false)
        return
      }

      const matchId = await findMatch()
      if (cancelled) return

      if (matchId) {
        matchedIdRef.current = matchId
        const detail = await fetchDetail(matchId)
        if (!cancelled && detail) {
          setGranolaMatch(detail)
        }
      }
      setLoading(false)
    }

    init()

    return () => {
      cancelled = true
    }
  }, [meetingTitle, checkAvailability, findMatch, fetchDetail])

  // Poll for transcript updates while meeting is active
  useEffect(() => {
    if (!meetingTitle || !matchedIdRef.current) return

    pollRef.current = setInterval(pollForUpdates, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [meetingTitle, pollForUpdates])

  // Try to find match again (e.g., Granola started recording after Symphony)
  const retryMatch = useCallback(async () => {
    setLoading(true)
    const matchId = await findMatch()
    if (matchId) {
      matchedIdRef.current = matchId
      const detail = await fetchDetail(matchId)
      if (detail) setGranolaMatch(detail)
    }
    setLoading(false)
  }, [findMatch, fetchDetail])

  return {
    /** Whether Open Brain local server is reachable */
    available,
    /** Whether we're loading/searching for a match */
    loading,
    /** The matched Granola meeting with full transcript + notes */
    granolaMatch,
    /** Retry finding a match (if Granola started late) */
    retryMatch,
  }
}
