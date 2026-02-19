import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  PlaybookBlock,
  PlaybookInstance,
  PlaybookItem,
  CreateBlockInput,
  UpdateBlockInput,
  QuickReact,
  DayType,
} from '@/types/playbook'
import { getAllFallbackBlocks } from '@/config/fallback-playbook'

// DB row → PlaybookBlock
function rowToBlock(row: Record<string, unknown>): PlaybookBlock {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    templateId: row.template_id as string | null,
    layerId: row.layer_id as string | null,
    sourceRuleIds: (row.source_rule_ids || []) as string[],
    visibility: (row.visibility || 'self') as PlaybookBlock['visibility'],
    timeSlot: row.time_slot as string,
    label: row.label as string,
    blockType: row.block_type as PlaybookBlock['blockType'],
    narrative: row.narrative as string,
    coachingNote: row.coaching_note as string | null,
    items: (row.items || []) as PlaybookItem[],
    dayTypes: (row.day_types || ['school-day']) as DayType[],
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// DB row → PlaybookInstance
function rowToInstance(row: Record<string, unknown>): PlaybookInstance {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    blockId: row.block_id as string,
    date: row.date as string,
    completed: row.completed as boolean,
    react: row.react as QuickReact | null,
    tags: (row.tags || []) as string[],
    notes: row.notes as string | null,
    itemsState: row.items_state as Record<string, boolean> | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function usePlaybook() {
  const [blocks, setBlocks] = useState<PlaybookBlock[]>([])
  const [instances, setInstances] = useState<PlaybookInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  // Fetch all blocks for this user
  const fetchBlocks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBlocks([]); return }

    const { data, error } = await supabase
      .from('playbook_blocks')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) { console.error('fetchBlocks:', error); return }
    setBlocks((data || []).map(rowToBlock))
  }, [])

  // Fetch instances for a specific date
  const fetchInstancesForDate = useCallback(async (date: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setInstances([]); return }

    const { data, error } = await supabase
      .from('playbook_instances')
      .select('*')
      .eq('date', date)

    if (error) { console.error('fetchInstances:', error); return }
    setInstances((data || []).map(rowToInstance))
  }, [])

  // Seed fallback blocks (one-time) if user has no blocks
  const seedFallbackBlocks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSeeding(true)
    try {
      const allBlocks = getAllFallbackBlocks()
      const rows = allBlocks.map((block) => ({
        user_id: user.id,
        template_id: block.templateId,
        time_slot: block.timeSlot,
        label: block.label,
        block_type: block.blockType,
        narrative: block.narrative,
        coaching_note: block.coachingNote || null,
        items: block.items.map((item, i) => ({ ...item, id: `item-${i}` })),
        day_types: block.dayTypes,
        sort_order: block.sortOrder,
      }))

      const { error } = await supabase.from('playbook_blocks').insert(rows)
      if (error) { console.error('seedFallbackBlocks:', error); return }

      await fetchBlocks()
    } finally {
      setSeeding(false)
    }
  }, [fetchBlocks])

  // Instantiate blocks for a day — creates instances for blocks matching the day type
  const instantiateDay = useCallback(async (date: string, dayType: DayType) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get blocks matching this day type
    const matchingBlocks = blocks.filter(b => b.dayTypes.includes(dayType))
    if (matchingBlocks.length === 0) return

    // Check which blocks already have instances for this date
    const existingBlockIds = new Set(
      instances.filter(i => i.date === date).map(i => i.blockId)
    )

    const newInstances = matchingBlocks
      .filter(b => !existingBlockIds.has(b.id))
      .map(b => ({
        user_id: user.id,
        block_id: b.id,
        date,
        completed: false,
        tags: [],
        items_state: null,
      }))

    if (newInstances.length === 0) return

    const { error } = await supabase.from('playbook_instances').insert(newInstances)
    if (error) { console.error('instantiateDay:', error); return }

    await fetchInstancesForDate(date)
  }, [blocks, instances, fetchInstancesForDate])

  // Mark block done / undone
  const markBlockDone = useCallback(async (instanceId: string, completed?: boolean) => {
    const instance = instances.find(i => i.id === instanceId)
    if (!instance) return

    const newCompleted = completed ?? !instance.completed

    const { error } = await supabase
      .from('playbook_instances')
      .update({ completed: newCompleted, updated_at: new Date().toISOString() })
      .eq('id', instanceId)

    if (error) { console.error('markBlockDone:', error); return }
    setInstances(prev => prev.map(i =>
      i.id === instanceId ? { ...i, completed: newCompleted } : i
    ))
  }, [instances])

  // React to block
  const reactToBlock = useCallback(async (instanceId: string, react: QuickReact | null) => {
    const { error } = await supabase
      .from('playbook_instances')
      .update({ react, updated_at: new Date().toISOString() })
      .eq('id', instanceId)

    if (error) { console.error('reactToBlock:', error); return }
    setInstances(prev => prev.map(i =>
      i.id === instanceId ? { ...i, react } : i
    ))
  }, [])

  // Tag block
  const tagBlock = useCallback(async (instanceId: string, tags: string[]) => {
    const { error } = await supabase
      .from('playbook_instances')
      .update({ tags, updated_at: new Date().toISOString() })
      .eq('id', instanceId)

    if (error) { console.error('tagBlock:', error); return }
    setInstances(prev => prev.map(i =>
      i.id === instanceId ? { ...i, tags } : i
    ))
  }, [])

  // Note on block
  const noteBlock = useCallback(async (instanceId: string, notes: string | null) => {
    const { error } = await supabase
      .from('playbook_instances')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', instanceId)

    if (error) { console.error('noteBlock:', error); return }
    setInstances(prev => prev.map(i =>
      i.id === instanceId ? { ...i, notes } : i
    ))
  }, [])

  // Toggle per-kid item completion
  const toggleItem = useCallback(async (instanceId: string, itemId: string) => {
    const instance = instances.find(i => i.id === instanceId)
    if (!instance) return

    const currentState = instance.itemsState || {}
    const newState = { ...currentState, [itemId]: !currentState[itemId] }

    const { error } = await supabase
      .from('playbook_instances')
      .update({ items_state: newState, updated_at: new Date().toISOString() })
      .eq('id', instanceId)

    if (error) { console.error('toggleItem:', error); return }
    setInstances(prev => prev.map(i =>
      i.id === instanceId ? { ...i, itemsState: newState } : i
    ))
  }, [instances])

  // ── Block CRUD ──

  const addBlock = useCallback(async (input: CreateBlockInput): Promise<PlaybookBlock | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const maxSort = blocks.length > 0 ? Math.max(...blocks.map(b => b.sortOrder)) + 1 : 0

    const row = {
      user_id: user.id,
      template_id: input.templateId || null,
      time_slot: input.timeSlot,
      label: input.label,
      block_type: input.blockType,
      narrative: input.narrative,
      coaching_note: input.coachingNote || null,
      items: input.items.map((item, i) => ({ ...item, id: `item-${Date.now()}-${i}` })),
      day_types: input.dayTypes,
      sort_order: input.sortOrder ?? maxSort,
    }

    const { data, error } = await supabase
      .from('playbook_blocks')
      .insert(row)
      .select()
      .single()

    if (error) { console.error('addBlock:', error); return null }

    const newBlock = rowToBlock(data)
    setBlocks(prev => [...prev, newBlock].sort((a, b) => a.sortOrder - b.sortOrder))
    return newBlock
  }, [blocks])

  const updateBlock = useCallback(async (id: string, updates: UpdateBlockInput): Promise<void> => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (updates.timeSlot !== undefined) row.time_slot = updates.timeSlot
    if (updates.label !== undefined) row.label = updates.label
    if (updates.blockType !== undefined) row.block_type = updates.blockType
    if (updates.narrative !== undefined) row.narrative = updates.narrative
    if (updates.coachingNote !== undefined) row.coaching_note = updates.coachingNote
    if (updates.items !== undefined) row.items = updates.items
    if (updates.dayTypes !== undefined) row.day_types = updates.dayTypes
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder
    if (updates.templateId !== undefined) row.template_id = updates.templateId

    const { error } = await supabase
      .from('playbook_blocks')
      .update(row)
      .eq('id', id)

    if (error) { console.error('updateBlock:', error); return }

    setBlocks(prev => prev.map(b => {
      if (b.id !== id) return b
      return {
        ...b,
        ...(updates.timeSlot !== undefined && { timeSlot: updates.timeSlot }),
        ...(updates.label !== undefined && { label: updates.label }),
        ...(updates.blockType !== undefined && { blockType: updates.blockType }),
        ...(updates.narrative !== undefined && { narrative: updates.narrative }),
        ...(updates.coachingNote !== undefined && { coachingNote: updates.coachingNote }),
        ...(updates.items !== undefined && { items: updates.items }),
        ...(updates.dayTypes !== undefined && { dayTypes: updates.dayTypes }),
        ...(updates.sortOrder !== undefined && { sortOrder: updates.sortOrder }),
        ...(updates.templateId !== undefined && { templateId: updates.templateId }),
        updatedAt: new Date().toISOString(),
      }
    }).sort((a, b) => a.sortOrder - b.sortOrder))
  }, [])

  const deleteBlock = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('playbook_blocks')
      .delete()
      .eq('id', id)

    if (error) { console.error('deleteBlock:', error); return }
    setBlocks(prev => prev.filter(b => b.id !== id))
  }, [])

  const reorderBlocks = useCallback(async (blockIds: string[]): Promise<void> => {
    const updates = blockIds.map((id, i) => ({
      id,
      sort_order: i,
      updated_at: new Date().toISOString(),
    }))

    // Batch update via individual calls (Supabase doesn't support bulk upsert on non-PK fields easily)
    const promises = updates.map(u =>
      supabase.from('playbook_blocks').update({ sort_order: u.sort_order, updated_at: u.updated_at }).eq('id', u.id)
    )
    const results = await Promise.all(promises)
    const failed = results.find(r => r.error)
    if (failed?.error) { console.error('reorderBlocks:', failed.error); return }

    setBlocks(prev => {
      const orderMap = new Map(blockIds.map((id, i) => [id, i]))
      return prev.map(b => ({
        ...b,
        sortOrder: orderMap.get(b.id) ?? b.sortOrder,
      })).sort((a, b) => a.sortOrder - b.sortOrder)
    })
  }, [])

  // Joined instances with their blocks
  const instancesWithBlocks = useMemo(() => {
    const blockMap = new Map(blocks.map(b => [b.id, b]))
    return instances.map(i => ({
      ...i,
      block: blockMap.get(i.blockId),
    }))
  }, [blocks, instances])

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      await fetchBlocks()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [fetchBlocks])

  // Auto-seed fallback blocks if user has none (after initial load)
  useEffect(() => {
    if (loading || seeding) return
    if (blocks.length === 0) {
      seedFallbackBlocks()
    }
  }, [loading, seeding, blocks.length, seedFallbackBlocks])

  return {
    blocks,
    instances: instancesWithBlocks,
    loading: loading || seeding,
    fetchBlocks,
    fetchInstancesForDate,
    instantiateDay,
    addBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
    markBlockDone,
    reactToBlock,
    tagBlock,
    noteBlock,
    toggleItem,
    seedFallbackBlocks,
  }
}
