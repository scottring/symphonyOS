// The Settings → Admin "Founding households" list: approve a waitlist row to
// let that email sign up. Distinct from useWaitlist/WaitlistAdmin (the
// pending/invited/converted roster) — this backs the signup GATE itself
// (2026-09-06_signup_gate_waitlist.sql: an allow-listed email OR an approved
// waitlist row). A founding household that signed up on the landing page
// could not create an account until an admin approved them here.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface WaitlistAdminRow {
  id: string
  email: string
  createdAt: Date
  approvedAt: Date | null
}

interface DbRow {
  id: string
  email: string
  created_at: string
  approved_at: string | null
}

function toRow(db: DbRow): WaitlistAdminRow {
  return {
    id: db.id,
    email: db.email,
    createdAt: new Date(db.created_at),
    approvedAt: db.approved_at ? new Date(db.approved_at) : null,
  }
}

export function useWaitlistAdmin() {
  const [rows, setRows] = useState<WaitlistAdminRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('waitlist')
      .select('id,email,created_at,approved_at')
      .order('created_at', { ascending: false })
    setRows(((data as DbRow[] | null) ?? []).map(toRow))
    setLoading(false)
  }, [])

  useEffect(() => { void fetchRows() }, [fetchRows])

  const approve = useCallback(async (id: string) => {
    const approvedAtIso = new Date().toISOString()
    await supabase.from('waitlist').update({ approved_at: approvedAtIso }).eq('id', id)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, approvedAt: new Date(approvedAtIso) } : r)))
  }, [])

  return { rows, loading, approve }
}
