import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { IntelligenceLayer } from '@/types/intelligence-layer'

interface LayerAssessment {
  id: string
  layerId: string
  status: 'setup' | 'active' | 'inactive' | 'paused'
  completedAt: string | null
  config: Record<string, unknown>
  lastGenerationAt: string | null
  generationCount: number
  notes: string | null
}

export interface LayerWithAssessment {
  layer: IntelligenceLayer
  assessment: LayerAssessment | null
}

function rowToLayer(row: Record<string, unknown>): IntelligenceLayer {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    color: row.color as string,
    icon: row.icon as string | null,
    description: row.description as string | null,
    status: row.status as IntelligenceLayer['status'],
    createdAt: row.created_at as string,
  }
}

function rowToAssessment(row: Record<string, unknown>): LayerAssessment {
  return {
    id: row.id as string,
    layerId: row.layer_id as string,
    status: row.status as LayerAssessment['status'],
    completedAt: row.completed_at as string | null,
    config: (row.config || {}) as Record<string, unknown>,
    lastGenerationAt: row.last_generation_at as string | null,
    generationCount: (row.generation_count || 0) as number,
    notes: row.notes as string | null,
  }
}

export function useIntelligenceLayers() {
  const [layers, setLayers] = useState<IntelligenceLayer[]>([])
  const [assessments, setAssessments] = useState<LayerAssessment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLayers = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: layerRows }, { data: assessmentRows }] = await Promise.all([
        supabase.from('intelligence_layers').select('*').order('created_at'),
        supabase.from('layer_assessments').select('*'),
      ])

      setLayers((layerRows || []).map(rowToLayer))
      setAssessments((assessmentRows || []).map(rowToAssessment))
    } catch (err) {
      console.error('fetchLayers error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLayers()
  }, [fetchLayers])

  const activateLayer = useCallback(async (layerId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('layer_assessments')
      .upsert({
        user_id: user.id,
        layer_id: layerId,
        status: 'active',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,layer_id' })
      .select()
      .single()

    if (error) { console.error('activateLayer:', error); return }
    if (data) {
      setAssessments(prev => {
        const existing = prev.findIndex(a => a.layerId === layerId)
        const newAssessment = rowToAssessment(data)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = newAssessment
          return updated
        }
        return [...prev, newAssessment]
      })
    }
  }, [])

  const deactivateLayer = useCallback(async (layerId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('layer_assessments')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('layer_id', layerId)
      .eq('user_id', user.id)

    if (error) { console.error('deactivateLayer:', error); return }
    setAssessments(prev => prev.map(a =>
      a.layerId === layerId ? { ...a, status: 'inactive' as const } : a
    ))
  }, [])

  // Combine layers with their assessments
  const layersWithAssessments: LayerWithAssessment[] = layers.map(layer => ({
    layer,
    assessment: assessments.find(a => a.layerId === layer.id) || null,
  }))

  const activeLayers = layersWithAssessments.filter(l => l.assessment?.status === 'active')

  return {
    layers,
    assessments,
    layersWithAssessments,
    activeLayers,
    loading,
    activateLayer,
    deactivateLayer,
    refetch: fetchLayers,
  }
}
