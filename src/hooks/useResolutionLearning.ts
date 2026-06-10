// src/hooks/useResolutionLearning.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ContactSuggestion, EntityAlias } from '@/lib/entityResolver'

export type ResolutionAction = 'auto_applied' | 'accepted' | 'dismissed' | 'ignored'

export interface ResolutionOutcome {
  inputText: string
  suggestion: ContactSuggestion
  action: ResolutionAction
  taskId?: string
}

/**
 * Loads learned entity aliases (once per session) and records resolution
 * outcomes. All writes are fire-and-forget: a failed write must never block
 * or fail task creation.
 */
export function useResolutionLearning() {
  const { user } = useAuth()
  const [aliases, setAliases] = useState<EntityAlias[]>([])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('entity_aliases')
      .select('alias_normalized, entity_type, entity_id')
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setAliases(data.map((d) => ({
          aliasNormalized: d.alias_normalized as string,
          entityType: d.entity_type as EntityAlias['entityType'],
          entityId: d.entity_id as string,
        })))
      })
    return () => { cancelled = true }
  }, [user])

  const recordOutcome = useCallback((o: ResolutionOutcome) => {
    if (!user) return
    void supabase.from('resolution_log').insert({
      user_id: user.id,
      input_text: o.inputText,
      suggested_entity_type: 'contact',
      suggested_entity_id: o.suggestion.contactId,
      score: o.suggestion.score,
      tier: o.suggestion.tier,
      action: o.action,
      task_id: o.taskId ?? null,
    })

    const learns = (o.action === 'accepted' || o.action === 'auto_applied') && o.suggestion.tier !== 'containment'
    if (learns) {
      void supabase.rpc('upsert_entity_alias', {
        p_alias: o.suggestion.matchedText,
        p_entity_type: 'contact',
        p_entity_id: o.suggestion.contactId,
        p_source: 'accepted',
      })
      // Optimistic local alias so the learning works within the same session.
      setAliases((prev) =>
        prev.some((a) => a.aliasNormalized === o.suggestion.matchedText && a.entityType === 'contact')
          ? prev
          : [...prev, { aliasNormalized: o.suggestion.matchedText, entityType: 'contact', entityId: o.suggestion.contactId }],
      )
    }
  }, [user])

  return { aliases, recordOutcome }
}
