// src/lib/display/displayWrites.ts
//
// The two writes a paired display may make (migration 20261021180000):
// check a routine off for a day, and tick a task. The database refuses every
// direct write from a display, so a display's check-off goes through these
// server functions instead. A kid's tablet may only use them for its own
// kid's items; the server checks that, not this file.

import { supabase as defaultSupabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

/** A display signs in anonymously (pairing.ts); a person never does. */
export function isDisplayUser(user: Pick<User, 'is_anonymous'> | null | undefined): boolean {
  return user?.is_anonymous === true
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Mark a routine done (or not) for a local day. `progress`, when given, is
 *  the day's minutes or count toward the routine's target. */
export async function displaySetRoutineDone(
  routineId: string,
  date: Date,
  done: boolean,
  progress: number | null = null,
  supabase = defaultSupabase,
): Promise<boolean> {
  const args: Record<string, unknown> = { p_routine_id: routineId, p_date: ymd(date), p_done: done }
  if (progress != null) args.p_progress = Math.round(progress)
  const { error } = await supabase.rpc('display_set_routine_done', args)
  if (error) console.error('display check-off refused:', error.message)
  return !error
}

export async function displaySetTaskDone(taskId: string, done: boolean, supabase = defaultSupabase): Promise<boolean> {
  const { error } = await supabase.rpc('display_set_task_done', { p_task_id: taskId, p_done: done })
  if (error) console.error('display task tick refused:', error.message)
  return !error
}
