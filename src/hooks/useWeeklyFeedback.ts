import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { QuickReact } from '@/types/playbook'

export interface BlockFeedbackSummary {
  blockId: string
  blockLabel: string
  blockType: string
  instanceCount: number
  completedCount: number
  completionRate: number
  reacts: Record<QuickReact, number>
  tags: Record<string, number>
  notes: string[]
  flagged: boolean // 2+ "tough" reacts
}

export interface WeeklyStats {
  totalInstances: number
  completedInstances: number
  completionRate: number
  reactBreakdown: Record<QuickReact, number>
  topTags: { tag: string; count: number }[]
}

function getWeekDates(weekOf: string): { start: string; end: string } {
  const d = new Date(weekOf + 'T00:00:00')
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return {
    start: weekOf,
    end: end.toISOString().split('T')[0],
  }
}

export function useWeeklyFeedback(weekOf: string) {
  const [loading, setLoading] = useState(true)
  const [rawInstances, setRawInstances] = useState<Record<string, unknown>[]>([])
  const [blockLabels, setBlockLabels] = useState<Map<string, { label: string; blockType: string }>>(new Map())

  const fetchFeedback = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRawInstances([]); setLoading(false); return }

    const { start, end } = getWeekDates(weekOf)

    setLoading(true)

    // Fetch instances for the week range
    const { data: instances, error: instError } = await supabase
      .from('playbook_instances')
      .select('*')
      .gte('date', start)
      .lte('date', end)

    if (instError) { console.error('fetchWeeklyFeedback:', instError); setLoading(false); return }

    // Get block labels for all referenced blocks
    const blockIds = [...new Set((instances || []).map((i: Record<string, unknown>) => i.block_id as string))]
    if (blockIds.length > 0) {
      const { data: blocks } = await supabase
        .from('playbook_blocks')
        .select('id, label, block_type')
        .in('id', blockIds)

      const labels = new Map<string, { label: string; blockType: string }>()
      for (const b of (blocks || [])) {
        labels.set(b.id, { label: b.label, blockType: b.block_type })
      }
      setBlockLabels(labels)
    }

    setRawInstances(instances || [])
    setLoading(false)
  }, [weekOf])

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  const blockSummaries = useMemo((): BlockFeedbackSummary[] => {
    const byBlock = new Map<string, Record<string, unknown>[]>()
    for (const inst of rawInstances) {
      const blockId = inst.block_id as string
      if (!byBlock.has(blockId)) byBlock.set(blockId, [])
      byBlock.get(blockId)!.push(inst)
    }

    return Array.from(byBlock.entries()).map(([blockId, instances]) => {
      const meta = blockLabels.get(blockId)
      const completedCount = instances.filter(i => i.completed).length
      const reacts: Record<QuickReact, number> = { 'nailed-it': 0, 'okay': 0, 'tough': 0 }
      const tags: Record<string, number> = {}
      const notes: string[] = []

      for (const inst of instances) {
        if (inst.react) reacts[inst.react as QuickReact]++
        for (const tag of (inst.tags as string[] || [])) {
          tags[tag] = (tags[tag] || 0) + 1
        }
        if (inst.notes) notes.push(inst.notes as string)
      }

      return {
        blockId,
        blockLabel: meta?.label || 'Unknown',
        blockType: meta?.blockType || 'routine',
        instanceCount: instances.length,
        completedCount,
        completionRate: instances.length > 0 ? completedCount / instances.length : 0,
        reacts,
        tags,
        notes,
        flagged: reacts['tough'] >= 2,
      }
    })
  }, [rawInstances, blockLabels])

  const overallStats = useMemo((): WeeklyStats => {
    const totalInstances = rawInstances.length
    const completedInstances = rawInstances.filter(i => i.completed).length
    const reactBreakdown: Record<QuickReact, number> = { 'nailed-it': 0, 'okay': 0, 'tough': 0 }
    const tagCounts: Record<string, number> = {}

    for (const inst of rawInstances) {
      if (inst.react) reactBreakdown[inst.react as QuickReact]++
      for (const tag of (inst.tags as string[] || [])) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }))

    return {
      totalInstances,
      completedInstances,
      completionRate: totalInstances > 0 ? completedInstances / totalInstances : 0,
      reactBreakdown,
      topTags,
    }
  }, [rawInstances])

  const flaggedBlocks = useMemo(() =>
    blockSummaries.filter(b => b.flagged),
  [blockSummaries])

  return {
    blockSummaries,
    overallStats,
    flaggedBlocks,
    loading,
    refetch: fetchFeedback,
  }
}
