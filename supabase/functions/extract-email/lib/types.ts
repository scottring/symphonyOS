export type Scope = 'individual' | 'couple' | 'compound'
export type Who = string[] | 'everyone'
export interface EmailEvent {
  title: string
  date: string            // YYYY-MM-DD
  time?: string           // HH:mm
  location?: string
  for: Who
  items: Array<{ text: string; for: Who; needed: 'night_before' | 'day_of' | string }>
  source_quote: string
  confidence: number
}
export interface EmailTodo { title: string; due?: string; for?: string[]; source_quote: string; confidence: number }
export interface EmailGap { kind: 'unreadable_attachment' | 'truncated' | 'low_confidence'; note: string }
export interface EmailExtraction { events: EmailEvent[]; todos: EmailTodo[]; good_to_know: string[]; gaps: EmailGap[] }

export interface Member { id: string; name: string; isChild: boolean }

export interface TaskRow {
  user_id: string
  title: string
  completed: false
  bucket: 'timed' | 'inbox'
  context: 'family'
  scope: Scope
  category: 'event' | 'task'
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
/** An incomplete email-derived block already in the household, for dedupe. */
export interface ExistingBlock { id: string; title: string; ymd: string; childTitles: string[] }
