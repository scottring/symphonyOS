// useYearbook — CRUD for Relish yearbooks (per-person, per-year activity books)
// Ported from Relish, adapted for Supabase

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Yearbook } from '@/types/yearbook'

interface UseYearbookReturn {
  yearbooks: Yearbook[]
  loading: boolean
  error: string | null
  getYearbook: (yearbookId: string) => Yearbook | undefined
  getYearbookForPerson: (personId: string, year?: number) => Yearbook | undefined
  createYearbook: (personId: string, year?: number) => Promise<string>
  getOrCreateYearbook: (personId: string) => Promise<string>
}

export function useYearbook(householdId: string | null): UseYearbookReturn {
  const [yearbooks, setYearbooks] = useState<Yearbook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!householdId) {
      setYearbooks([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchYearbooks() {
      const { data, error: fetchError } = await supabase
        .from('yearbooks')
        .select('*')
        .eq('household_id', householdId)
        .order('year', { ascending: false })

      if (cancelled) return

      if (fetchError) {
        console.error('Error fetching yearbooks:', fetchError)
        setError(fetchError.message)
      } else {
        setYearbooks(data || [])
      }
      setLoading(false)
    }

    fetchYearbooks()

    return () => {
      cancelled = true
    }
  }, [householdId])

  const getYearbook = useCallback((yearbookId: string) => {
    return yearbooks.find(y => y.id === yearbookId)
  }, [yearbooks])

  const getYearbookForPerson = useCallback((personId: string, year?: number) => {
    const targetYear = year || new Date().getFullYear()
    return yearbooks.find(y => y.person_id === personId && y.year === targetYear)
  }, [yearbooks])

  const createYearbook = useCallback(async (personId: string, year?: number): Promise<string> => {
    if (!householdId) throw new Error('No household')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const targetYear = year || new Date().getFullYear()

    const { data: newYearbook, error: createError } = await supabase
      .from('yearbooks')
      .insert({
        household_id: householdId,
        user_id: user.id,
        person_id: personId,
        year: targetYear,
        chapters: [],
      })
      .select('id')
      .single()

    if (createError) throw createError
    return newYearbook.id
  }, [householdId])

  const getOrCreateYearbook = useCallback(async (personId: string): Promise<string> => {
    const existing = getYearbookForPerson(personId)
    if (existing) return existing.id
    return createYearbook(personId)
  }, [getYearbookForPerson, createYearbook])

  return {
    yearbooks,
    loading,
    error,
    getYearbook,
    getYearbookForPerson,
    createYearbook,
    getOrCreateYearbook,
  }
}
