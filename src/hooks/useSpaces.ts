// src/hooks/useSpaces.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Space, Fact } from '@/types/home'

interface DbSpace {
  id: string
  home_id: string
  parent_space_id: string | null
  space_type: 'room' | 'zone'
  name: string
  photo_url: string | null
  sort_order: number
  facts: Fact[]
  created_by: string
  created_at: string
  updated_at: string
}

function dbSpaceToSpace(db: DbSpace): Space {
  return {
    id: db.id,
    homeId: db.home_id,
    parentSpaceId: db.parent_space_id,
    spaceType: db.space_type,
    name: db.name,
    photoUrl: db.photo_url ?? undefined,
    sortOrder: db.sort_order,
    facts: db.facts ?? [],
    createdBy: db.created_by,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function useSpaces(homeId: string | undefined) {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !homeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpaces([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('spaces')
        .select('*')
        .eq('home_id', homeId)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (e) { setError(e.message); setLoading(false); return }
      setSpaces((data as DbSpace[]).map(dbSpaceToSpace))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, homeId])

  const rooms = useMemo(() => spaces.filter((s) => s.spaceType === 'room'), [spaces])
  const zones = useMemo(() => spaces.filter((s) => s.spaceType === 'zone'), [spaces])

  const addRoom = useCallback(async (input: { name: string; photoUrl?: string }): Promise<Space | null> => {
    if (!user || !homeId) return null
    const { data, error: e } = await supabase
      .from('spaces')
      .insert({
        home_id: homeId, parent_space_id: null, space_type: 'room',
        name: input.name, photo_url: input.photoUrl ?? null,
        created_by: user.id, facts: [],
      })
      .select('*').single()
    if (e || !data) { setError(e?.message ?? 'insert failed'); return null }
    const sp = dbSpaceToSpace(data as DbSpace)
    setSpaces((prev) => [...prev, sp])
    return sp
  }, [user, homeId])

  const addZone = useCallback(async (input: { parentSpaceId: string; name: string; photoUrl?: string }): Promise<Space | null> => {
    if (!user || !homeId) return null
    const parent = spaces.find((s) => s.id === input.parentSpaceId)
    if (parent && parent.spaceType !== 'room') {
      throw new Error('zones cannot be nested inside other zones')
    }
    const { data, error: e } = await supabase
      .from('spaces')
      .insert({
        home_id: homeId, parent_space_id: input.parentSpaceId, space_type: 'zone',
        name: input.name, photo_url: input.photoUrl ?? null,
        created_by: user.id, facts: [],
      })
      .select('*').single()
    if (e || !data) { setError(e?.message ?? 'insert failed'); return null }
    const sp = dbSpaceToSpace(data as DbSpace)
    setSpaces((prev) => [...prev, sp])
    return sp
  }, [user, homeId, spaces])

  const updateSpace = useCallback(async (id: string, patch: Partial<{ name: string; photoUrl: string; sortOrder: number; facts: Fact[] }>): Promise<void> => {
    const dbPatch: Record<string, unknown> = {}
    if (patch.name !== undefined) dbPatch.name = patch.name
    if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl
    if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder
    if (patch.facts !== undefined) dbPatch.facts = patch.facts
    const { error: e } = await supabase.from('spaces').update(dbPatch).eq('id', id)
    if (e) { setError(e.message); return }
    setSpaces((prev) => prev.map((s) => s.id === id ? { ...s, ...patch, updatedAt: new Date() } as Space : s))
  }, [])

  const deleteSpace = useCallback(async (id: string): Promise<void> => {
    const { error: e } = await supabase.from('spaces').delete().eq('id', id)
    if (e) { setError(e.message); return }
    setSpaces((prev) => prev.filter((s) => s.id !== id))
  }, [])

  return { spaces, rooms, zones, loading, error, addRoom, addZone, updateSpace, deleteSpace }
}
