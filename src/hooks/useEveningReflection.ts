import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/** Local YYYY-MM-DD for the reflection's `date` column (one row per day). */
function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Loads and persists the day's evening reflection (evening_reflections: one row
 * per user per date, with a highlight + notes). Update-or-insert on save so the
 * end-of-day review can capture the day's highlight without any migration.
 */
export function useEveningReflection(date: Date) {
  const { user } = useAuth()
  const key = dateKey(date)
  const [rowId, setRowId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard load hook: clear/settle on auth+date change
    if (!user) { setLoading(false); return }
    let active = true
    setLoading(true)
    void supabase
      .from('evening_reflections')
      .select('id, highlight, notes')
      .eq('date', key)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setRowId(data?.id ?? null)
        setHighlight(data?.highlight ?? '')
        setNotes(data?.notes ?? '')
        setLoading(false)
      })
    return () => { active = false }
  }, [user, key])

  const save = useCallback(async () => {
    if (!user) return
    const payload = { highlight: highlight.trim(), notes: notes.trim() }
    if (rowId) {
      await supabase.from('evening_reflections').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', rowId)
    } else {
      // Nothing to persist yet — don't create an empty row on close.
      if (!payload.highlight && !payload.notes) return
      const { data } = await supabase
        .from('evening_reflections')
        .insert({ user_id: user.id, date: key, ...payload })
        .select('id')
        .maybeSingle()
      if (data) setRowId(data.id)
    }
  }, [user, key, rowId, highlight, notes])

  return { highlight, setHighlight, notes, setNotes, save, loading }
}
