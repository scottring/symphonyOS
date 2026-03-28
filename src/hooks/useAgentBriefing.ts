import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchBriefing, type BriefingData } from '@/lib/openBrain'

const CACHE_KEY = 'symphony:briefing'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

interface CachedBriefing {
  data: BriefingData
  fetchedAt: number
}

function getCached(): BriefingData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedBriefing
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null
    return cached.data
  } catch {
    return null
  }
}

function setCache(data: BriefingData): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }))
  } catch {
    // Storage full or unavailable
  }
}

export function useAgentBriefing() {
  const [briefing, setBriefing] = useState<BriefingData | null>(() => getCached())
  const [loading, setLoading] = useState(!briefing)
  const [error, setError] = useState<string | null>(null)
  const fetchingRef = useRef(false)

  const refresh = useCallback(async (force = false) => {
    if (fetchingRef.current) return
    if (!force && briefing) return

    fetchingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const data = await fetchBriefing()
      if (data) {
        setBriefing(data)
        setCache(data)
      } else {
        setError('Could not reach Open Brain')
      }
    } catch {
      setError('Failed to fetch briefing')
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [briefing])

  // Fetch on mount if not cached
  useEffect(() => {
    if (!briefing) {
      refresh(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when app is foregrounded and cache is stale
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const cached = getCached()
        if (!cached) {
          refresh(true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refresh])

  return { briefing, loading, error, refresh }
}
