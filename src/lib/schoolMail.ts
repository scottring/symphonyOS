export type {
  SchoolMailItem,
  SchoolMailProposal,
} from '../../supabase/functions/extract-email/lib/review'
import type {
  SchoolMailItem,
  SchoolMailProposal,
} from '../../supabase/functions/extract-email/lib/review'

export interface SchoolMailReceipt {
  status: 'saved' | 'dismissed'
  count: number
  items: { id: string; kind: string; title: string }[]
  skipped?: string[]
}
export interface SchoolMailMessage {
  id: string
  subject: string | null
  sourceLabel: string | null
  createdAt: string
  sourceText: string | null
  status: 'processing' | 'failed' | 'ready' | 'saved' | 'dismissed' | 'legacy'
  proposal: SchoolMailProposal | null
  result: SchoolMailReceipt | null
  error: string | null
}
export interface SchoolMailOverview {
  householdId: string | null
  address: string | null
  members: { id: string; name: string }[]
  messages: SchoolMailMessage[]
}
export const EMPTY_SCHOOL_MAIL: SchoolMailOverview = {
  householdId: null,
  address: null,
  members: [],
  messages: [],
}
export const SCHOOL_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export function schoolItemDestination(item: SchoolMailItem): string {
  if (item.kind === 'notice') {
    return 'School notice · kept here and on the shared tablet · no task added'
  }
  if (item.kind === 'routine') {
    return `Routine · ${
      item.repeat?.type === 'daily'
        ? 'every day'
        : item.repeat?.days?.join(', ') ?? 'choose days'
    } · ${item.showOnTimeline ? 'shows in Today and Week' : 'kept in Routines'}`
  }
  if (!item.date) return 'Inbox · no day chosen'
  const date = new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${date}${
    item.time ? ` at ${item.time}` : ' · no set time'
  } · Today and Week`
}
