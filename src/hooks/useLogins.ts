import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'

/** A place you sign in. The password itself is never stored, only a hint. */
export interface Login {
  id: string
  site: string
  url: string | null
  username: string | null
  passwordHint: string | null
  notes: string | null
  updatedAt: Date
}

export interface LoginInput {
  site: string
  url: string | null
  username: string | null
  passwordHint: string | null
  notes: string | null
}

interface DbLogin {
  id: string
  site: string
  url: string | null
  username: string | null
  password_hint: string | null
  notes: string | null
  updated_at: string
}

function toLogin(r: DbLogin): Login {
  return {
    id: r.id, site: r.site, url: r.url, username: r.username,
    passwordHint: r.password_hint, notes: r.notes, updatedAt: new Date(r.updated_at),
  }
}

function toRow(i: LoginInput) {
  return {
    site: i.site.trim(),
    url: i.url?.trim() || null,
    username: i.username?.trim() || null,
    password_hint: i.passwordHint?.trim() || null,
    notes: i.notes?.trim() || null,
  }
}

const bySite = (a: Login, b: Login) => a.site.localeCompare(b.site, undefined, { sensitivity: 'base' })

export function useLogins() {
  const { user } = useAuth()
  const [logins, setLogins] = useState<Login[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setLogins([]); setLoading(false); return
    }
    let active = true
    setLoading(true); setError(null)
    supabase.from('logins').select('id, site, url, username, password_hint, notes, updated_at')
      .then(({ data, error: e }) => {
        if (!active) return
        if (e) setError("Couldn't load your logins.")
        else setLogins((data as DbLogin[]).map(toLogin).sort(bySite))
        setLoading(false)
      })
    return () => { active = false }
  }, [user])

  const addLogin = useCallback(async (input: LoginInput): Promise<boolean> => {
    const { data, error: e } = await supabase.from('logins').insert(toRow(input))
      .select('id, site, url, username, password_hint, notes, updated_at').single()
    if (e || !data) { showToast("Couldn't save that login. Please try again.", 'error'); return false }
    setLogins((prev) => [...prev, toLogin(data as DbLogin)].sort(bySite))
    return true
  }, [])

  const updateLogin = useCallback(async (id: string, input: LoginInput): Promise<boolean> => {
    const { data, error: e } = await supabase.from('logins')
      .update({ ...toRow(input), updated_at: new Date().toISOString() }).eq('id', id)
      .select('id, site, url, username, password_hint, notes, updated_at').single()
    if (e || !data) { showToast("Couldn't save that change. Please try again.", 'error'); return false }
    setLogins((prev) => prev.map((l) => (l.id === id ? toLogin(data as DbLogin) : l)).sort(bySite))
    return true
  }, [])

  const deleteLogin = useCallback(async (id: string): Promise<void> => {
    const { error: e } = await supabase.from('logins').delete().eq('id', id)
    if (e) { showToast("Couldn't delete that login. Please try again.", 'error'); return }
    setLogins((prev) => prev.filter((l) => l.id !== id))
  }, [])

  return { logins, loading, error, addLogin, updateLogin, deleteLogin }
}
