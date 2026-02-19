import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { TaskContext } from '@/types/task'

interface CalendarDomainMapping {
  calendarId: string
  calendarName: string
  domain: TaskContext
}

export function useCalendarDomainMappings() {
  const { user } = useAuth()
  const [mappings, setMappings] = useState<CalendarDomainMapping[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setMappings([])
      setLoading(false)
      return
    }

    async function fetchMappings() {
      const { data, error } = await supabase
        .from('calendar_domain_mappings')
        .select('calendar_id, calendar_name, domain')
        .eq('user_id', user!.id)

      if (error) {
        console.error('Failed to fetch calendar domain mappings:', error)
        setLoading(false)
        return
      }

      setMappings(
        (data ?? []).map((row) => ({
          calendarId: row.calendar_id,
          calendarName: row.calendar_name,
          domain: row.domain as TaskContext,
        }))
      )
      setLoading(false)
    }

    fetchMappings()
  }, [user])

  const getDomainForCalendar = useCallback(
    (calendarId?: string | null, calendarName?: string | null): TaskContext | null => {
      if (!calendarId && !calendarName) return null

      // Match by calendar_id first (exact)
      if (calendarId) {
        const match = mappings.find((m) => m.calendarId === calendarId)
        if (match) return match.domain
      }

      // Fall back to calendar_name (case-insensitive)
      if (calendarName) {
        const nameLower = calendarName.toLowerCase()
        const match = mappings.find(
          (m) => m.calendarName.toLowerCase() === nameLower
        )
        if (match) return match.domain
      }

      return null
    },
    [mappings]
  )

  return { mappings, loading, getDomainForCalendar }
}
