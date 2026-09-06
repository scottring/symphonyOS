import { useEffect, useState } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { handoffFileName, handoffFolder, handoffStoragePath } from '@/lib/paperHandoff'

export type PaperHandoffStatus = 'waiting' | 'received' | 'expired'

export const HANDOFF_POLL_MS = 2500
export const HANDOFF_EXPIRES_MS = 10 * 60 * 1000

/**
 * Desktop side of the phone hand-off: while `id` is set, poll the user's
 * `page/` folder for the phone's upload. Resolves once with the storage path.
 * Polling stops on receipt, on expiry, or when the id is cleared/unmounted.
 */
export function usePaperHandoff(id: string | null): { status: PaperHandoffStatus; storagePath: string | null } {
  // Keyed by id so a new hand-off starts out 'waiting' without an effect
  // having to reset anything.
  const [outcome, setOutcome] = useState<{ id: string; status: 'received' | 'expired'; storagePath: string | null } | null>(null)

  useEffect(() => {
    if (!id) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const startedAt = Date.now()

    const tick = async () => {
      if (cancelled) return
      try {
        const { data: { user } } = await getAuthUser()
        if (!user || cancelled) return
        const { data } = await supabase.storage
          .from('attachments')
          .list(handoffFolder(user.id), { search: handoffFileName(id) })
        if (cancelled) return
        const hit = data?.find((o) => o.name === handoffFileName(id))
        if (hit) {
          setOutcome({ id, status: 'received', storagePath: handoffStoragePath(user.id, id) })
          return
        }
      } catch {
        // A failed tick is just a missed tick; the next one retries.
      }
      if (Date.now() - startedAt >= HANDOFF_EXPIRES_MS) {
        setOutcome({ id, status: 'expired', storagePath: null })
        return
      }
      timer = setTimeout(() => void tick(), HANDOFF_POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id])

  if (id && outcome?.id === id) return { status: outcome.status, storagePath: outcome.storagePath }
  return { status: 'waiting', storagePath: null }
}
