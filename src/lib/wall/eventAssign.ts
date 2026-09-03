// Who is ON a calendar event, as the wall writes it. The answer to "who's
// walking tomorrow?" is an `event_notes.assigned_to` on that day's INSTANCE
// — the same column the phone's event panel writes, so the two agree, and
// the same partial upsert `updateEventFree` already uses on this table.
//
// Instance, never series: a face tapped on Tuesday evening answers Wednesday,
// not every Wednesday. A standing default can still be set on the series from
// the event panel; the wall reads instance-then-series (useWallData).
import { supabase } from '@/lib/supabase'

export async function assignWallEvent(userId: string, eventKey: string, memberId: string): Promise<string | null> {
  const { error } = await supabase
    .from('event_notes')
    .upsert(
      { user_id: userId, google_event_id: eventKey, assigned_to: memberId },
      { onConflict: 'user_id,google_event_id' },
    )
  return error ? error.message : null
}
