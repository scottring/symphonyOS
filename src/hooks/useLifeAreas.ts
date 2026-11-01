// Life areas (Health, Money, Fun…): the goal_areas rows, each in a space
// (Work / Family / Personal). Reads what RLS lets through: your own, plus a
// household partner's Family areas, which are `mine: false` and read-only.
// A legacy area with no space comes back with context null; callers treat it
// as Personal until the owner sets one.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { TaskContext } from '@/types/task'
import type { DbGoalArea } from '@/types/goal'

export interface LifeArea {
  id: string
  name: string
  context: TaskContext | null
  /** Written by the signed-in user. A partner's Family area is not. */
  mine: boolean
  sortOrder: number
}

const CONTEXTS: readonly string[] = ['work', 'family', 'personal']

function toArea(db: DbGoalArea, userId: string): LifeArea {
  return {
    id: db.id,
    name: db.name,
    context: db.context && CONTEXTS.includes(db.context) ? (db.context as TaskContext) : null,
    mine: db.user_id === userId,
    sortOrder: db.sort_order,
  }
}

export function useLifeAreas() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [areas, setAreas] = useState<LifeArea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('goal_areas')
        .select('id, user_id, name, context, sort_order')
        .order('sort_order')
      if (cancelled) return
      if (!error && data) setAreas((data as DbGoalArea[]).map(d => toArea(d, userId)))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId])

  const add = useCallback(async (name: string, context: TaskContext): Promise<LifeArea | null> => {
    const trimmed = name.trim()
    if (!userId || !trimmed) return null
    const sortOrder = areas.reduce((m, a) => (a.mine ? Math.max(m, a.sortOrder + 1) : m), 0)
    const { data, error } = await supabase
      .from('goal_areas')
      .insert({ user_id: userId, name: trimmed, context, sort_order: sortOrder })
      .select('id, user_id, name, context, sort_order')
      .single()
    if (error || !data) return null
    const created = toArea(data as DbGoalArea, userId)
    setAreas(prev => [...prev, created])
    return created
  }, [userId, areas])

  const patch = useCallback(async (id: string, fields: Partial<Pick<DbGoalArea, 'name' | 'context'>>): Promise<boolean> => {
    if (!userId) return false
    const { error } = await supabase.from('goal_areas').update(fields).eq('id', id).eq('user_id', userId)
    if (error) return false
    setAreas(prev => prev.map(a => a.id === id
      ? { ...a, ...(fields.name !== undefined ? { name: fields.name } : {}), ...(fields.context !== undefined ? { context: fields.context as TaskContext | null } : {}) }
      : a))
    return true
  }, [userId])

  const rename = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    return trimmed ? patch(id, { name: trimmed }) : Promise.resolve(false)
  }, [patch])

  const setContext = useCallback((id: string, context: TaskContext) => patch(id, { context }), [patch])

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!userId) return false
    const { error } = await supabase.from('goal_areas').delete().eq('id', id).eq('user_id', userId)
    if (error) return false
    setAreas(prev => prev.filter(a => a.id !== id))
    return true
  }, [userId])

  return { areas: userId ? areas : [], loading: userId ? loading : false, add, rename, setContext, remove }
}
