import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { FamilyRule } from '@/types/playbook'

function rowToRule(row: Record<string, unknown>): FamilyRule {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    rule: row.rule as string,
    appliesTo: (row.applies_to || ['everyone']) as string[],
    category: (row.category || null) as string | null,
    layerId: (row.layer_id || null) as string | null,
    status: (row.status || 'active') as FamilyRule['status'],
    rationale: row.rationale as string | null,
    enforcementTip: row.enforcement_tip as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useFamilyRules() {
  const [rules, setRules] = useState<FamilyRule[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRules = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRules([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('family_rules')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) { console.error('fetchRules:', error); setLoading(false); return }
    setRules((data || []).map(rowToRule))
    setLoading(false)
  }, [])

  const addRule = useCallback(async (input: {
    rule: string
    appliesTo?: string[]
    category?: string
    layerId?: string
    rationale?: string
    enforcementTip?: string
  }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('family_rules')
      .insert({
        user_id: user.id,
        rule: input.rule,
        applies_to: input.appliesTo || ['everyone'],
        category: input.category || null,
        layer_id: input.layerId || null,
        rationale: input.rationale || null,
        enforcement_tip: input.enforcementTip || null,
      })
      .select()
      .single()

    if (error) { console.error('addRule:', error); return null }
    const newRule = rowToRule(data)
    setRules(prev => [...prev, newRule])
    return newRule
  }, [])

  const updateRule = useCallback(async (id: string, updates: Partial<Pick<FamilyRule, 'rule' | 'appliesTo' | 'category' | 'layerId' | 'status' | 'rationale' | 'enforcementTip'>>) => {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.rule !== undefined) dbUpdates.rule = updates.rule
    if (updates.appliesTo !== undefined) dbUpdates.applies_to = updates.appliesTo
    if (updates.category !== undefined) dbUpdates.category = updates.category
    if (updates.layerId !== undefined) dbUpdates.layer_id = updates.layerId
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.rationale !== undefined) dbUpdates.rationale = updates.rationale
    if (updates.enforcementTip !== undefined) dbUpdates.enforcement_tip = updates.enforcementTip

    const { error } = await supabase
      .from('family_rules')
      .update(dbUpdates)
      .eq('id', id)

    if (error) { console.error('updateRule:', error); return }
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }, [])

  const deleteRule = useCallback(async (id: string) => {
    const { error } = await supabase.from('family_rules').delete().eq('id', id)
    if (error) { console.error('deleteRule:', error); return }
    setRules(prev => prev.filter(r => r.id !== id))
  }, [])

  const activeRules = rules.filter(r => r.status === 'active')

  useEffect(() => { fetchRules() }, [fetchRules])

  return { rules, activeRules, loading, addRule, updateRule, deleteRule, fetchRules }
}
