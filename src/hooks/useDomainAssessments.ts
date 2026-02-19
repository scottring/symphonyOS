import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ratingToScore } from '@/config/layers'
import type { DomainAssessment, QuickAssessmentInput } from '@/types/layer'

function rowToAssessment(row: Record<string, unknown>): DomainAssessment {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    layerId: row.layer_id as string,
    domainSlug: row.domain_slug as string,
    harmonyScore: row.harmony_score as number,
    summary: row.summary as string | null,
    strengths: (row.strengths || []) as string[],
    issues: (row.issues || []) as string[],
    opportunities: (row.opportunities || []) as string[],
    challengeNote: row.challenge_note as string | null,
    assessedAt: row.assessed_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useDomainAssessments(layerId: string | null) {
  const [assessments, setAssessments] = useState<DomainAssessment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAssessments = useCallback(async () => {
    if (!layerId) {
      setAssessments([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('domain_assessments')
        .select('*')
        .eq('layer_id', layerId)
        .order('domain_slug')

      if (error) {
        console.error('fetchDomainAssessments error:', error)
        return
      }

      setAssessments((data || []).map(rowToAssessment))
    } catch (err) {
      console.error('fetchDomainAssessments error:', err)
    } finally {
      setLoading(false)
    }
  }, [layerId])

  useEffect(() => {
    fetchAssessments()
  }, [fetchAssessments])

  // Get score for a specific domain
  const getScore = useCallback((domainSlug: string): number | null => {
    const assessment = assessments.find(a => a.domainSlug === domainSlug)
    return assessment?.harmonyScore ?? null
  }, [assessments])

  // Get full assessment for a domain
  const getAssessment = useCallback((domainSlug: string): DomainAssessment | null => {
    return assessments.find(a => a.domainSlug === domainSlug) ?? null
  }, [assessments])

  // Count assessed domains
  const assessedCount = assessments.length

  // Save quick assessment (batch of domain ratings)
  const saveQuickAssessment = useCallback(async (
    ratings: QuickAssessmentInput[]
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !layerId) return false

    const now = new Date().toISOString()
    const rows = ratings
      .filter(r => r.rating > 0)
      .map(r => ({
        user_id: user.id,
        layer_id: layerId,
        domain_slug: r.domainSlug,
        harmony_score: ratingToScore(r.rating),
        challenge_note: r.challengeNote || null,
        strengths: [],
        issues: [],
        opportunities: [],
        summary: null,
        assessed_at: now,
        updated_at: now,
      }))

    if (rows.length === 0) return false

    const { error } = await supabase
      .from('domain_assessments')
      .upsert(rows, { onConflict: 'user_id,layer_id,domain_slug' })

    if (error) {
      console.error('saveQuickAssessment error:', error)
      return false
    }

    await fetchAssessments()
    return true
  }, [layerId, fetchAssessments])

  // Update a single domain's assessment (after deep assessment)
  const updateAssessment = useCallback(async (
    domainSlug: string,
    updates: Partial<Pick<DomainAssessment, 'harmonyScore' | 'summary' | 'strengths' | 'issues' | 'opportunities' | 'challengeNote'>>
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !layerId) return false

    const { error } = await supabase
      .from('domain_assessments')
      .upsert({
        user_id: user.id,
        layer_id: layerId,
        domain_slug: domainSlug,
        ...(updates.harmonyScore !== undefined && { harmony_score: updates.harmonyScore }),
        ...(updates.summary !== undefined && { summary: updates.summary }),
        ...(updates.strengths !== undefined && { strengths: updates.strengths }),
        ...(updates.issues !== undefined && { issues: updates.issues }),
        ...(updates.opportunities !== undefined && { opportunities: updates.opportunities }),
        ...(updates.challengeNote !== undefined && { challenge_note: updates.challengeNote }),
        assessed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,layer_id,domain_slug' })

    if (error) {
      console.error('updateAssessment error:', error)
      return false
    }

    await fetchAssessments()
    return true
  }, [layerId, fetchAssessments])

  return {
    assessments,
    loading,
    getScore,
    getAssessment,
    assessedCount,
    saveQuickAssessment,
    updateAssessment,
    refetch: fetchAssessments,
  }
}
