// useManual — CRUD + real-time subscription for Relish family manuals
// Ported from Relish, adapted for Supabase

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Manual, ManualType, DomainId, DomainUpdateSource } from '@/types/manual'
import { emptyDomains } from '@/types/manual'

interface UseManualReturn {
  manuals: Manual[]
  loading: boolean
  error: string | null
  getManual: (manualId: string) => Manual | undefined
  createManual: (type: ManualType, title: string, personId?: string) => Promise<string>
  updateDomain: (manualId: string, domainId: DomainId, data: Record<string, unknown>, source?: DomainUpdateSource) => Promise<void>
}

export function useManual(householdId: string | null): UseManualReturn {
  const [manuals, setManuals] = useState<Manual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch manuals and subscribe to real-time updates
  useEffect(() => {
    if (!householdId) {
      setManuals([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchManuals() {
      const { data, error: fetchError } = await supabase
        .from('manuals')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (fetchError) {
        console.error('Error fetching manuals:', fetchError)
        setError(fetchError.message)
      } else {
        setManuals(data || [])
      }
      setLoading(false)
    }

    fetchManuals()

    // Real-time subscription
    const channel = supabase
      .channel(`manuals:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'manuals',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setManuals(prev => [...prev, payload.new as Manual])
          } else if (payload.eventType === 'UPDATE') {
            setManuals(prev => prev.map(m =>
              m.id === (payload.new as Manual).id ? (payload.new as Manual) : m
            ))
          } else if (payload.eventType === 'DELETE') {
            setManuals(prev => prev.filter(m => m.id !== (payload.old as { id: string }).id))
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [householdId])

  const getManual = useCallback((manualId: string) => {
    return manuals.find(m => m.id === manualId)
  }, [manuals])

  const createManual = useCallback(async (type: ManualType, title: string, personId?: string): Promise<string> => {
    if (!householdId) throw new Error('No household')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const { data: newManual, error: createError } = await supabase
      .from('manuals')
      .insert({
        household_id: householdId,
        user_id: user.id,
        type,
        title,
        person_id: personId || null,
        domains: emptyDomains,
        domain_meta: {},
      })
      .select('id')
      .single()

    if (createError) throw createError
    return newManual.id
  }, [householdId])

  const updateDomain = useCallback(async (
    manualId: string,
    domainId: DomainId,
    data: Record<string, unknown>,
    source: DomainUpdateSource = 'manual-edit'
  ) => {
    // Read current, merge, write back (Supabase doesn't have dot-notation updates for JSONB)
    const { data: current, error: readError } = await supabase
      .from('manuals')
      .select('domains, domain_meta')
      .eq('id', manualId)
      .single()

    if (readError) throw readError

    const updatedDomains = { ...current.domains, [domainId]: data }
    const updatedMeta = {
      ...(current.domain_meta || {}),
      [domainId]: {
        updated_at: new Date().toISOString(),
        updated_by: source,
      },
    }

    const { error: updateError } = await supabase
      .from('manuals')
      .update({
        domains: updatedDomains,
        domain_meta: updatedMeta,
      })
      .eq('id', manualId)

    if (updateError) throw updateError
  }, [])

  return {
    manuals,
    loading,
    error,
    getManual,
    createManual,
    updateDomain,
  }
}
