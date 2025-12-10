import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type WaitlistStatus = 'pending' | 'invited' | 'converted'

export interface WaitlistEntry {
  id: string
  email: string
  createdAt: Date
  source: string
  status: WaitlistStatus
}

interface DbWaitlistEntry {
  id: string
  email: string
  created_at: string
  source: string
  status: string
}

function dbToWaitlistEntry(db: DbWaitlistEntry): WaitlistEntry {
  return {
    id: db.id,
    email: db.email,
    createdAt: new Date(db.created_at),
    source: db.source || 'landing_page',
    status: db.status as WaitlistStatus,
  }
}

export function useWaitlist() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWaitlist = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setEntries((data || []).map(dbToWaitlistEntry))
    setLoading(false)
  }, [])

  const updateStatus = useCallback(async (id: string, status: WaitlistStatus) => {
    // Optimistic update
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, status } : e
    ))

    const { error: updateError } = await supabase
      .from('waitlist')
      .update({ status })
      .eq('id', id)

    if (updateError) {
      setError(updateError.message)
      // Revert on error
      await fetchWaitlist()
    }
  }, [fetchWaitlist])

  const deleteEntry = useCallback(async (id: string) => {
    // Optimistic update
    setEntries(prev => prev.filter(e => e.id !== id))

    const { error: deleteError } = await supabase
      .from('waitlist')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      // Revert on error
      await fetchWaitlist()
    }
  }, [fetchWaitlist])

  // Fetch on mount
  useEffect(() => {
    fetchWaitlist()
  }, [fetchWaitlist])

  return {
    entries,
    loading,
    error,
    fetchWaitlist,
    updateStatus,
    deleteEntry,
  }
}
