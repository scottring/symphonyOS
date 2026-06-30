// Pure request validation + row building for place-call. Kept separate from
// index.ts (which calls Deno.serve at load) so it's importable under vitest.

export interface PlaceCallBody {
  taskId?: string
  toNumber?: string
  /** Dial a kid-phone allowlist contact by id; number resolved server-side. */
  contactId?: string
  mode?: 'bridge' | 'agent'
  /** Where the call was started — 'kiosk' rings the in-house handset, else the cell. */
  source?: 'app' | 'kiosk'
  context?: 'work' | 'family' | 'personal'
}

/** Map the call's source to the kid-phone bridge target. */
export function bridgeToFor(source: PlaceCallBody['source']): 'cell' | 'handset' {
  return source === 'kiosk' ? 'handset' : 'cell'
}

export type Validation =
  | { ok: true; mode: 'bridge' | 'agent' }
  | { ok: false; status: number; error: string }

/** Validate the request. Agent mode is gated off until Phase 5 ships. */
export function validateBody(body: Partial<PlaceCallBody>): Validation {
  const mode = body.mode ?? 'bridge'
  if (mode !== 'bridge' && mode !== 'agent') {
    return { ok: false, status: 400, error: 'mode must be bridge|agent' }
  }
  if (mode === 'agent') {
    return { ok: false, status: 403, error: 'agent mode not enabled (Phase 5)' }
  }
  if (!body.taskId && !body.toNumber && !body.contactId) {
    return { ok: false, status: 400, error: 'taskId, toNumber or contactId required' }
  }
  return { ok: true, mode }
}

/** The call_log row to insert when a call is requested. */
export function buildLogRow(
  userId: string,
  toNumber: string,
  mode: 'bridge' | 'agent',
  taskId: string | undefined,
  callSid: string | null,
): Record<string, unknown> {
  return {
    user_id: userId,
    task_id: taskId ?? null,
    to_number: toNumber,
    mode,
    direction: 'outbound',
    status: 'requested',
    call_sid: callSid,
  }
}
