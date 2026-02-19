import type { TaskContext } from './task'

export interface CoachingConversation {
  id: string
  userId: string
  itemType: 'task' | 'event' | 'routine'
  itemId: string
  itemTitle: string
  itemContext: TaskContext | null
  itemTime: string | null
  messages: ConversationMessage[]
  status: 'in_progress' | 'completed' | 'abandoned'
  resultBlockId: string | null
  createdAt: string
}

export interface CoachingObservation {
  id: string
  observation: string
  layerId: string | null
  domain: string | null
  tags: string[]
  sourceType: 'conversation' | 'feedback' | 'auto'
  createdAt: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface EveningReflectionData {
  id: string
  date: string
  highlight: string | null
  notes: string | null
}
