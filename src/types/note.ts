// Note type constants
export type NoteType = 'quick_capture' | 'meeting_note' | 'transcript' | 'voice_memo' | 'general' | 'task_note'
export type NoteSource = 'manual' | 'fathom' | 'voice' | 'import' | 'task'
export type NoteLinkType = 'related' | 'primary' | 'mentioned'
export type NoteEntityType = 'event' | 'project' | 'contact' | 'task' | 'routine'

// Display note - unified type for showing both Second Brain notes and task notes
export interface DisplayNote extends Note {
  sourceTaskId?: string // If this is from a task note
  sourceTaskTitle?: string // Task title for display
}

// ============================================================================
// Note Topic
// ============================================================================
export interface NoteTopic {
  id: string
  name: string
  description?: string
  color?: string
  archivedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface DbNoteTopic {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Note
// ============================================================================
export interface Note {
  id: string
  title?: string
  content: string
  type: NoteType
  source: NoteSource
  topicId?: string
  audioUrl?: string
  externalId?: string
  externalUrl?: string
  createdAt: Date
  updatedAt: Date
  // Populated from joins
  topic?: NoteTopic
  entityLinks?: NoteEntityLink[]
}

export interface DbNote {
  id: string
  user_id: string
  title: string | null
  content: string
  type: string
  source: string
  topic_id: string | null
  audio_url: string | null
  external_id: string | null
  external_url: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Note Entity Link
// ============================================================================
export interface NoteEntityLink {
  id: string
  noteId: string
  entityType: NoteEntityType
  entityId: string
  linkType: NoteLinkType
  createdAt: Date
}

export interface DbNoteEntityLink {
  id: string
  note_id: string
  entity_type: string
  entity_id: string
  link_type: string
  created_at: string
}

// ============================================================================
// Input types for creating/updating
// ============================================================================
export interface CreateNoteInput {
  title?: string
  content: string
  type?: NoteType
  source?: NoteSource
  topicId?: string
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  type?: NoteType
  topicId?: string | null
}

export interface CreateNoteTopicInput {
  name: string
  description?: string
  color?: string
}

export interface UpdateNoteTopicInput {
  name?: string
  description?: string
  color?: string
  archivedAt?: Date | null
}

export interface CreateEntityLinkInput {
  entityType: NoteEntityType
  entityId: string
  linkType?: NoteLinkType
}

// ============================================================================
// Note type colors and labels (for UI)
// ============================================================================
export const noteTypeColors: Record<NoteType, string> = {
  quick_capture: 'border-l-primary-300',
  meeting_note: 'border-l-blue-300',
  transcript: 'border-l-purple-300',
  voice_memo: 'border-l-amber-300',
  general: 'border-l-neutral-300',
  task_note: 'border-l-green-300',
}

export const noteTypeDotColors: Record<NoteType, string> = {
  quick_capture: 'bg-primary-400',
  meeting_note: 'bg-blue-400',
  transcript: 'bg-purple-400',
  voice_memo: 'bg-amber-400',
  general: 'bg-neutral-400',
  task_note: 'bg-green-400',
}

export const noteTypeLabels: Record<NoteType, string> = {
  quick_capture: 'Quick',
  meeting_note: 'Meeting',
  transcript: 'Transcript',
  voice_memo: 'Voice',
  general: '',
  task_note: 'Task',
}
