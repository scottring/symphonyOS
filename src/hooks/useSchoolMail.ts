import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import {
  EMPTY_SCHOOL_MAIL,
  type SchoolMailItem,
  type SchoolMailOverview,
  type SchoolMailReceipt,
} from '@/lib/schoolMail'

export function useSchoolMail() {
  const [overview, setOverview] = useState<SchoolMailOverview>(
    EMPTY_SCHOOL_MAIL,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (enable = false) => {
    try {
      const { data, error: failure } = await supabase.rpc(
        'school_mail_overview',
        { p_enable: enable },
      )
      if (failure) throw failure
      setOverview(data as SchoolMailOverview)
      setError(null)
    } catch {
      setError(
        'Could not load school information. Your saved items have not changed. Please refresh.',
      )
    } finally {
      setLoading(false)
    }
  }, [])
  const refresh = useCallback(() => load(false), [load])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useRefreshOnVisible(refresh)
  // This runs only while the settings panel is mounted and visible. It lets
  // the first forwarded email arrive without asking a parent to reload.
  useEffect(() => {
    if (!overview.address) return
    const timer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 15000)
    return () => clearInterval(timer)
  }, [overview.address, refresh])
  const enable = useCallback(() => load(true), [load])
  const retry = useCallback(async (id: string) => {
    const { error } = await supabase.functions.invoke('capture-retry', {
      body: { capture_id: id },
    })
    if (error) throw new Error('Could not retry this email. Please try again.')
    await refresh()
  }, [refresh])
  const save = useCallback(async (id: string, items: SchoolMailItem[]) => {
    const { data, error } = await supabase.rpc('save_school_mail_review', {
      p_capture: id,
      p_items: items,
    })
    if (error) {
      throw new Error(
        'The save was not confirmed. Your selection is still here. Try Save again; it will not add the same items twice.',
      )
    }
    const receipt = data as SchoolMailReceipt
    setOverview((previous) => ({
      ...previous,
      messages: previous.messages.map((message) =>
        message.id === id
          ? { ...message, status: receipt.status, result: receipt }
          : message
      ),
    }))
    window.dispatchEvent(new Event('symphony-school-review-saved'))
    return receipt
  }, [])
  return { ...overview, loading, error, enable, refresh, retry, save }
}
