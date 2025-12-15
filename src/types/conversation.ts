/**
 * Conversation types for the Chat interface
 */

// Database row types
export interface DbConversation {
  id: string
  user_id: string
  title: string | null
  started_at: string
  last_message_at: string
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

export interface DbConversationMessage {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  actions_taken: ActionTaken[]
  entity_references: EntityReference[]
  ai_model: string | null
  ai_latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
}

// Frontend types
export interface Conversation {
  id: string
  userId: string
  title: string | null
  startedAt: Date
  lastMessageAt: Date
  status: 'active' | 'archived'
  createdAt: Date
  updatedAt: Date
}

export interface ConversationMessage {
  id: string
  conversationId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  actionsTaken: ActionTaken[]
  entityReferences: EntityReference[]
  aiModel: string | null
  aiLatencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: Date
}

// Action tracking
export type ActionTakenType =
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'tasks_bulk_updated'
  | 'tasks_bulk_completed'
  | 'sms_sent'
  | 'email_sent'

export interface ActionTaken {
  type: ActionTakenType
  entityId?: string
  entityIds?: string[]
  title?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  error?: string
}

// Entity references in messages
export type EntityReferenceType = 'task' | 'project' | 'contact' | 'event' | 'routine' | 'calendar_event'

export interface EntityReference {
  type: EntityReferenceType
  id: string
  title: string
}

// Chat tool definitions for AI
export type ChatToolName =
  | 'get_tasks'
  | 'search_communications'
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'bulk_update_tasks'
  | 'bulk_complete_tasks'

export interface ChatToolCall {
  name: ChatToolName
  input: Record<string, unknown>
}

export interface ChatToolResult {
  name: ChatToolName
  result: unknown
  error?: string
}

// Converters
export function dbToConversation(db: DbConversation): Conversation {
  return {
    id: db.id,
    userId: db.user_id,
    title: db.title,
    startedAt: new Date(db.started_at),
    lastMessageAt: new Date(db.last_message_at),
    status: db.status,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

export function dbToConversationMessage(db: DbConversationMessage): ConversationMessage {
  return {
    id: db.id,
    conversationId: db.conversation_id,
    userId: db.user_id,
    role: db.role,
    content: db.content,
    actionsTaken: db.actions_taken || [],
    entityReferences: db.entity_references || [],
    aiModel: db.ai_model,
    aiLatencyMs: db.ai_latency_ms,
    inputTokens: db.input_tokens,
    outputTokens: db.output_tokens,
    createdAt: new Date(db.created_at),
  }
}
