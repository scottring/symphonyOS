// useEntries — CRUD + real-time for Relish entries (content atoms)
// Ported from Relish, adapted for Supabase

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Entry, EntryType, EntryContent, EntryLifecycle } from '@/types/entry'
import type { DomainId } from '@/types/manual'

interface UseEntriesOptions {
  yearbookId?: string
  manualId?: string
  personId?: string
  type?: EntryType
  domain?: DomainId
  lifecycle?: EntryLifecycle
}

interface NewEntryData {
  type: EntryType
  source: Entry['source']
  domain: DomainId
  title: string
  content: EntryContent
  manualId?: string
  yearbookId?: string
  personId?: string
  visibility?: Entry['visibility']
}

interface UseEntriesReturn {
  entries: Entry[]
  loading: boolean
  error: string | null
  getEntry: (entryId: string) => Entry | undefined
  createEntry: (data: NewEntryData) => Promise<string>
  updateEntry: (entryId: string, updates: Partial<Entry>) => Promise<void>
  deleteEntry: (entryId: string) => Promise<void>
  completeEntry: (entryId: string) => Promise<void>
}

export function useEntries(householdId: string | null, options: UseEntriesOptions = {}): UseEntriesReturn {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!householdId) {
      setEntries([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchEntries() {
      let query = supabase
        .from('entries')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })

      if (options.yearbookId) query = query.eq('yearbook_id', options.yearbookId)
      if (options.manualId) query = query.eq('manual_id', options.manualId)
      if (options.personId) query = query.eq('person_id', options.personId)
      if (options.type) query = query.eq('type', options.type)
      if (options.domain) query = query.eq('domain', options.domain)
      if (options.lifecycle) query = query.eq('lifecycle', options.lifecycle)

      const { data, error: fetchError } = await query

      if (cancelled) return

      if (fetchError) {
        console.error('Error fetching entries:', fetchError)
        setError(fetchError.message)
      } else {
        setEntries(data || [])
      }
      setLoading(false)
    }

    fetchEntries()

    // Real-time subscription
    const channel = supabase
      .channel(`entries:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          // Re-fetch on any change (simpler than merging with filters)
          fetchEntries()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [householdId, options.yearbookId, options.manualId, options.personId, options.type, options.domain, options.lifecycle])

  const getEntry = useCallback((entryId: string) => {
    return entries.find(e => e.id === entryId)
  }, [entries])

  const createEntry = useCallback(async (data: NewEntryData): Promise<string> => {
    if (!householdId) throw new Error('No household')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const { data: newEntry, error: createError } = await supabase
      .from('entries')
      .insert({
        household_id: householdId,
        user_id: user.id,
        manual_id: data.manualId || null,
        yearbook_id: data.yearbookId || null,
        person_id: data.personId || null,
        type: data.type,
        source: data.source,
        domain: data.domain,
        title: data.title,
        content: data.content,
        linked_entry_ids: [],
        lifecycle: 'active',
        visibility: data.visibility || 'family',
      })
      .select('id')
      .single()

    if (createError) throw createError
    return newEntry.id
  }, [householdId])

  const updateEntry = useCallback(async (entryId: string, updates: Partial<Entry>) => {
    const { error: updateError } = await supabase
      .from('entries')
      .update(updates)
      .eq('id', entryId)

    if (updateError) throw updateError
  }, [])

  const deleteEntry = useCallback(async (entryId: string) => {
    const { error: deleteError } = await supabase
      .from('entries')
      .delete()
      .eq('id', entryId)

    if (deleteError) throw deleteError
  }, [])

  const completeEntry = useCallback(async (entryId: string) => {
    const { error: updateError } = await supabase
      .from('entries')
      .update({
        lifecycle: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', entryId)

    if (updateError) throw updateError
  }, [])

  return {
    entries,
    loading,
    error,
    getEntry,
    createEntry,
    updateEntry,
    deleteEntry,
    completeEntry,
  }
}
