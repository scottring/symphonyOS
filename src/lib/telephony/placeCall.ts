// Client trigger for Symphony-placed calls (Phase 3). Invokes the place-call
// edge fn, which asks the kid-phone bridge to ring you and connect the callee.
// No-ops gracefully (telephony-not-configured) until the bridge is provisioned
// in Phase 4, so callers can wire this into the UI now.

import { supabase } from '@/lib/supabase'

export interface PlaceCallRequest {
  /** Prefer a taskId so the number + context resolve server-side. */
  taskId?: string
  /** Or a raw number for ad-hoc calls. */
  toNumber?: string
  /** Dial a kid-phone allowlist contact by id (number resolved server-side). */
  contactId?: string
  /** 'bridge' rings you then connects the callee; 'agent' is gated off (Phase 5). */
  mode?: 'bridge' | 'agent'
  /** Where the call was started — 'kiosk' rings the in-house handset, else your cell. */
  source?: 'app' | 'kiosk'
  context?: 'work' | 'family' | 'personal'
}

export interface PlaceCallResult {
  ok: boolean
  callSid?: string
  /** Set when the call could not be placed (e.g. telephony not configured). */
  error?: string
  /** Machine-readable rejection reason for expected soft-fails, e.g. 'quiet_hours'. */
  reason?: string
}

export async function placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
  const { data, error } = await supabase.functions.invoke('place-call', { body: req })
  if (error) return { ok: false, error: error.message }
  return data as PlaceCallResult
}
