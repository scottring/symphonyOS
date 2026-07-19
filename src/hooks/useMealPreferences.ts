import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PREFS_TITLE = 'Household Meal Preferences'

export interface UseMealPreferencesResult {
  content: string
  loading: boolean
  saving: boolean
  error: string | null
  save: (content: string) => Promise<boolean>
  reload: () => Promise<void>
}

/**
 * The household's meal "master prompt" — the canonical `Household Meal
 * Preferences` note that both AI surfaces read as their standing instructions.
 * There is one shared (couple-scoped) note per household; we always resolve the
 * OLDEST such note (matching the edge functions' resolver) so every reader and
 * writer touches the same row. Household RLS lets either partner read + edit it.
 */
export function useMealPreferences(): UseMealPreferencesResult {
  const [noteId, setNoteId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('notes').select('id, content')
      .eq('title', PREFS_TITLE)
      .order('created_at', { ascending: true })
      .limit(1)
    if (err) { setError(err.message); setLoading(false); return }
    const row = data?.[0]
    setNoteId(row?.id ?? null)
    setContent(row?.content ?? '')
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const save = useCallback(async (next: string): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      if (noteId) {
        const { error: err } = await supabase
          .from('notes')
          .update({ content: next, updated_at: new Date().toISOString() })
          .eq('id', noteId)
        if (err) { setError(err.message); return false }
      } else {
        // No note yet — create it couple-scoped so the partner sees it too.
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('not signed in'); return false }
        const { data, error: err } = await supabase
          .from('notes')
          .insert({ title: PREFS_TITLE, content: next, type: 'general', scope: 'couple', user_id: user.id })
          .select('id').single()
        if (err) { setError(err.message); return false }
        setNoteId(data?.id ?? null)
      }
      setContent(next)
      return true
    } finally {
      setSaving(false)
    }
  }, [noteId])

  return { content, loading, saving, error, save, reload }
}
