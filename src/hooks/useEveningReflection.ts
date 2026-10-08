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
  // The row and the date it belongs to: while another date loads, the last
  // date's row must neither read as "Reviewed" nor take this date's writes.
  const [row, setRow] = useState<{ key: string; id: string } | null>(null)
  const rowId = row?.key === key ? row.id : null
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
        setRow(data?.id ? { key, id: data.id } : null)
        setHighlight(data?.highlight ?? '')
        setNotes(data?.notes ?? '')
        setLoading(false)
      })
    return () => { active = false }
  }, [user, key])

  /** Keep what was written. Dismissing the review never creates an empty
   *  row — only closing the day does (closeDay). False when the write failed. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    const payload = { highlight: highlight.trim(), notes: notes.trim() }
    if (rowId) {
      const { error } = await supabase.from('evening_reflections').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', rowId)
      return !error
    }
    // Nothing to persist yet — don't create an empty row on close.
    if (!payload.highlight && !payload.notes) return true
    const { data, error } = await supabase
      .from('evening_reflections')
      .insert({ user_id: user.id, date: key, ...payload })
      .select('id')
      .maybeSingle()
    if (data) setRow({ key, id: data.id })
    return !error
  }, [user, key, rowId, highlight, notes])

  /**
   * "Close the day": keep the reflection AND record that the day was
   * reviewed. The day's row is that record — written even when the
   * reflection is blank, so Today can say "Reviewed" on any device
   * (2026-10-08). One row per user per date (unique index), so an upsert.
   */
  const closeDay = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    if (rowId) return save()
    const { data, error } = await supabase
      .from('evening_reflections')
      .upsert({ user_id: user.id, date: key, highlight: highlight.trim(), notes: notes.trim(), updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' })
      .select('id')
      .maybeSingle()
    if (data) setRow({ key, id: data.id })
    return !error
  }, [user, key, rowId, highlight, notes, save])

  /** The day has a reflection row: it was closed (or reflected on). */
  const reviewed = rowId !== null

  return { highlight, setHighlight, notes, setNotes, save, closeDay, reviewed, loading }
}

export type EveningReflection = ReturnType<typeof useEveningReflection>
