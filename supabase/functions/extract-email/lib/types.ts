export type Scope = 'individual' | 'couple' | 'compound'
export type Who = string[] | 'everyone'
/** homework = a STUDENT does or hands it in; todo = anything else a household does. */
export type ItemKind = 'homework' | 'todo'
export interface EmailEvent {
  title: string
  date: string            // YYYY-MM-DD
  time?: string           // HH:mm
  location?: string
  for: Who
  items: Array<{ text: string; for: Who; needed: 'night_before' | 'day_of' | string; kind: ItemKind; detail?: string }>
  source_quote: string
  confidence: number
}
export interface EmailTodo { title: string; due?: string; for?: string[]; kind: ItemKind; detail?: string; source_quote: string; confidence: number }
export interface EmailGap { kind: 'unreadable_attachment' | 'truncated' | 'low_confidence'; note: string }
export interface GoodToKnow { text: string; for: Who }
export interface EmailExtraction { events: EmailEvent[]; todos: EmailTodo[]; good_to_know: GoodToKnow[]; gaps: EmailGap[] }

export interface Member { id: string; name: string; isChild: boolean }

export interface TaskRow {
  user_id: string
  title: string
  completed: false
  bucket: 'timed' | 'inbox'
  context: 'family'
  scope: Scope
  category: 'event' | 'task' | 'homework'
  scheduled_for: string | null
  is_all_day: boolean | null
  location: string | null
  notes: string | null
  capture_id: string
  assigned_to: string | null
  assigned_to_all: string[] | null
  parent_task_id: string | null
  needed_on: string | null
}
export interface NoteRow {
  user_id: string; title: string; content: string; context: 'family'; scope: Scope; source: 'import'; type: 'general'; external_id: string
}
/** A `notices` row: standing info addressed to a member (null = everyone). */
export interface NoticeRow {
  user_id: string; family_member_id: string | null; text: string; sender_label: string; received_on: string; capture_id: string
}
/** An incomplete email-derived block already in the household, for dedupe. */
export interface ExistingBlock { id: string; title: string; ymd: string; childTitles: string[] }
