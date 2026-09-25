// src/lib/calendarConnection.ts
//
// Is a calendar connected? `null` when nobody has said.
//
// The day tiles need exactly one fact from the calendar: whether there IS
// one. "No calendar connected" is a COMPLETE count with nothing to miss;
// "the calendar could not be read" is an incomplete one, and drawing the
// second as the first is the lying-count failure the tiles exist to avoid.
//
// Published by the provider rather than read through its context, for the
// same reason `currentAccount` is: the readers are module caches and pickers
// in isolated harnesses, and `useGoogleCalendar` throws outside its provider.
// Unknown is a legitimate answer and must never be an exception.

let connected: boolean | null = null
const listeners = new Set<(v: boolean | null) => void>()

/** Told by GoogleCalendarProvider whenever the connection state settles. */
export function setCalendarConnected(v: boolean | null): void {
  if (connected === v) return
  connected = v
  for (const l of [...listeners]) l(v)
}

export function getCalendarConnected(): boolean | null {
  return connected
}

export function onCalendarConnectionChanged(cb: (v: boolean | null) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Test-only. */
export function __resetCalendarConnection(): void {
  connected = null
  listeners.clear()
}
