// src/lib/week/readiness.ts
//
// The Week bench's ready/bare read: does this task carry any of the context
// that makes it one-tap at execution time? Sunday-you provisions; this is how
// the grid shows which items Thursday-you will thank you for.
//
// Tasks only — events carry their calendar's own context, and routines have
// their pages. Attachments live in a separate table and aren't on the row, so
// they don't count here; notes/links/phone/location are the cheap, honest
// proxy (and the panel writes notes alongside most attachments anyway).

import type { TaskLink } from '@/types/task'

export interface ReadinessInputs {
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  location?: string
}

export function hasExecutionContext(item: ReadinessInputs): boolean {
  return Boolean(
    item.notes?.trim() ||
    (item.links?.length ?? 0) > 0 ||
    item.phoneNumber?.trim() ||
    item.location?.trim(),
  )
}
