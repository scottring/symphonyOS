import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Responsibility } from '@/types/playbook'

function rowToResponsibility(row: Record<string, unknown>): Responsibility {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    who: row.who as string,
    task: row.task as string,
    frequency: (row.frequency || 'daily') as string,
    status: (row.status || 'active') as Responsibility['status'],
    ruleId: row.rule_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useResponsibilities() {
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([])
  const [loading, setLoading] = useState(true)

  const fetchResponsibilities = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setResponsibilities([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('responsibilities')
      .select('*')
      .order('who', { ascending: true })

    if (error) { console.error('fetchResponsibilities:', error); setLoading(false); return }
    setResponsibilities((data || []).map(rowToResponsibility))
    setLoading(false)
  }, [])

  const addResponsibility = useCallback(async (input: {
    who: string
    task: string
    frequency?: string
    ruleId?: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('responsibilities')
      .insert({
        user_id: user.id,
        who: input.who,
        task: input.task,
        frequency: input.frequency || 'daily',
        rule_id: input.ruleId || null,
      })
      .select()
      .single()

    if (error) { console.error('addResponsibility:', error); return null }
    const newResp = rowToResponsibility(data)
    setResponsibilities(prev => [...prev, newResp])
    return newResp
  }, [])

  const updateResponsibility = useCallback(async (id: string, updates: Partial<Pick<Responsibility, 'task' | 'frequency' | 'status' | 'who'>>) => {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.task !== undefined) dbUpdates.task = updates.task
    if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.who !== undefined) dbUpdates.who = updates.who

    const { error } = await supabase
      .from('responsibilities')
      .update(dbUpdates)
      .eq('id', id)

    if (error) { console.error('updateResponsibility:', error); return }
    setResponsibilities(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }, [])

  const deleteResponsibility = useCallback(async (id: string) => {
    const { error } = await supabase.from('responsibilities').delete().eq('id', id)
    if (error) { console.error('deleteResponsibility:', error); return }
    setResponsibilities(prev => prev.filter(r => r.id !== id))
  }, [])

  // Get responsibilities for a specific rule
  const getForRule = useCallback((ruleId: string) => {
    return responsibilities.filter(r => r.ruleId === ruleId && r.status === 'active')
  }, [responsibilities])

  useEffect(() => { fetchResponsibilities() }, [fetchResponsibilities])

  return { responsibilities, loading, addResponsibility, updateResponsibility, deleteResponsibility, getForRule }
}
