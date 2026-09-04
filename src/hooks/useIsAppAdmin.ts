// Is the signed-in user an app admin?
//
// Backs the Settings "Admin" tab (demo controls + the waitlist roster). The
// tab used to render for everyone, and the waitlist's RLS matched — any
// authenticated user could read and delete the whole signup list. The policy
// is the real fix (2026-09-04_app_admins_waitlist_rls.sql); this hook only
// stops the app from showing a tab whose queries would now return nothing.
//
// `app_admins` lets a user SELECT only their OWN row, so this query returns
// either one row (admin) or zero (everyone else) — it never leaks the roster.

import { useState, useEffect } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'

export function useIsAppAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  // Starts true so a tab can't flash in and out while the check is in flight;
  // callers should render nothing admin-shaped until this clears.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const { data: { user } } = await getAuthUser()
      if (!user) {
        if (!cancelled) { setIsAdmin(false); setLoading(false) }
        return
      }
      const { data } = await supabase
        .from('app_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!cancelled) {
        setIsAdmin(!!data)
        setLoading(false)
      }
    }

    void check()
    return () => { cancelled = true }
  }, [])

  return { isAdmin, loading }
}
