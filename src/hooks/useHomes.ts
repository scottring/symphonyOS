// src/hooks/useHomes.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Home } from '@/types/home'

interface DbHome {
  id: string
  user_id: string
  name: string
  address: string | null
  created_at: string
  updated_at: string
}

function dbHomeToHome(db: DbHome): Home {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    address: db.address ?? undefined,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function useHomes() {
  const { user } = useAuth()
  const [homes, setHomes] = useState<Home[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setHomes([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      if (!user) return
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('homes')
        .select('*')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (e) {
        setError(e.message)
        setLoading(false)
        return
      }
      setHomes((data as DbHome[]).map(dbHomeToHome))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const addHome = useCallback(async (input: { name: string; address?: string }): Promise<Home | null> => {
    if (!user) return null
    const { data, error: e } = await supabase
      .from('homes')
      .insert({ user_id: user.id, name: input.name, address: input.address ?? null })
      .select('*')
      .single()
    if (e || !data) {
      setError(e?.message ?? 'insert failed')
      return null
    }
    const home = dbHomeToHome(data as DbHome)
    setHomes((prev) => [...prev, home])
    return home
  }, [user])

  const updateHome = useCallback(async (id: string, patch: Partial<{ name: string; address: string }>): Promise<void> => {
    const { error: e } = await supabase
      .from('homes')
      .update(patch)
      .eq('id', id)
    if (e) { setError(e.message); return }
    setHomes((prev) => prev.map((h) => h.id === id ? { ...h, ...patch, updatedAt: new Date() } : h))
  }, [])

  return { homes, loading, error, addHome, updateHome }
}
