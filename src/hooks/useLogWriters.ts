import { useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import * as db from '@/lib/choices/db'
import * as logDb from '@/lib/choices/logDb'
import { announceChoices } from '@/lib/choices/events'
import type { LogWriters } from '@/lib/choices/logSave'

/** The log's writes bound to the client and the signed-in user; each
 *  announces the change so Choices and the log refetch. */
export function useLogWriters(): LogWriters {
  const { user } = useAuth()
  const me = useRef(user?.id)
  useEffect(() => { me.current = user?.id })
  return useMemo<LogWriters>(() => {
    const announce = async <T,>(p: Promise<T>): Promise<T> => { const r = await p; announceChoices(); return r }
    return {
      addLogEntry: async (input) => (me.current ? announce(logDb.addLogEntry(supabase, me.current, input)) : null),
      updateLogEntry: (id, patch) => announce(logDb.updateLogEntry(supabase, id, patch)),
      deleteLogEntry: (id) => announce(logDb.deleteLogEntry(supabase, id)),
      planEvent: async (input) => (me.current ? announce(logDb.planEvent(supabase, me.current, input)) : null),
      updateOption: (id, patch) => announce(db.updateOption(supabase, id, patch)),
      deleteTask: (id) => announce(db.deleteFollowUp(supabase, id)),
    }
  }, [])
}
