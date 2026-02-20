// Coached Daily Playbook types

export type BlockType = 'solo' | 'transition' | 'routine' | 'connection' | 'together' | 'buffer' | 'departure' | 'partner' | 'sibling' | 'household'
export type QuickReact = 'nailed-it' | 'okay' | 'tough'
export type DayType = 'school-day' | 'weekend' | 'holiday' | 'half-day'

export interface PlaybookItem {
  id: string
  who: string           // "kaleb", "ella", "both", "partner", "self"
  action: string
  time?: string         // optional per-item time, e.g. "6:15"
  context?: string      // why this matters
  coaching?: string     // personalized note
  completed?: boolean
}

export interface PlaybookBlock {
  id: string
  userId: string
  templateId?: string | null
  layerId?: string | null
  sourceRuleIds?: string[]
  sourceItemRef?: { type: 'task' | 'event' | 'routine'; id: string } | null
  visibility?: 'self' | 'family' | 'shared'
  timeSlot: string       // "6:50" or "5:30-6:45"
  label: string
  blockType: BlockType
  narrative: string
  coachingNote?: string | null
  items: PlaybookItem[]
  dayTypes: DayType[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// Input types for block CRUD
export interface CreateBlockInput {
  timeSlot: string
  label: string
  blockType: BlockType
  narrative: string
  coachingNote?: string | null
  items: Omit<PlaybookItem, 'id'>[]
  dayTypes: DayType[]
  sortOrder?: number
  templateId?: string | null
  sourceItemRef?: { type: 'task' | 'event' | 'routine'; id: string } | null
}

export interface CoachingBlockSuggestion {
  label: string
  blockType: BlockType
  timeSlot: string
  narrative: string
  coachingNote?: string
  items: Omit<PlaybookItem, 'id'>[]
  dayTypes: DayType[]
  sourceRuleIds?: string[]
}

export interface UpdateBlockInput {
  timeSlot?: string
  label?: string
  blockType?: BlockType
  narrative?: string
  coachingNote?: string | null
  items?: PlaybookItem[]
  dayTypes?: DayType[]
  sortOrder?: number
  templateId?: string | null
}

export interface PlaybookInstance {
  id: string
  userId: string
  blockId: string
  date: string           // YYYY-MM-DD
  completed: boolean
  react?: QuickReact | null
  tags: string[]
  notes?: string | null
  itemsState?: Record<string, boolean> | null
  createdAt: string
  updatedAt: string
  // Joined from block
  block?: PlaybookBlock
}

export interface WeeklyTemplate {
  id: string
  userId: string
  weekOf: string         // YYYY-MM-DD (Monday)
  focusAreas: string[]
  reviewNotes?: string | null
  createdAt: string
  updatedAt: string
}

export interface FamilyRule {
  id: string
  userId: string
  rule: string
  appliesTo: string[]
  category: string | null
  layerId: string | null
  status: 'draft' | 'active' | 'paused' | 'retired'
  rationale?: string | null
  enforcementTip?: string | null
  createdAt: string
  updatedAt: string
}

export interface Responsibility {
  id: string
  userId: string
  who: string
  task: string
  frequency: string
  status: 'active' | 'paused'
  ruleId?: string | null
  createdAt: string
  updatedAt: string
}

// Block type display config
export const BLOCK_TYPE_CONFIG: Record<BlockType, { label: string; color: string; bgColor: string }> = {
  solo: { label: 'Solo', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  transition: { label: 'Transition', color: 'text-stone-600', bgColor: 'bg-stone-100' },
  routine: { label: 'Routine', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  connection: { label: 'Connection', color: 'text-sage-700', bgColor: 'bg-sage-100' },
  together: { label: 'Together', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  buffer: { label: 'Buffer', color: 'text-neutral-600', bgColor: 'bg-neutral-100' },
  departure: { label: 'Departure', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  partner: { label: 'Partner', color: 'text-rose-700', bgColor: 'bg-rose-100' },
  sibling: { label: 'Sibling', color: 'text-violet-700', bgColor: 'bg-violet-100' },
  household: { label: 'Household', color: 'text-teal-700', bgColor: 'bg-teal-100' },
}

// Quick react display config
export const QUICK_REACT_CONFIG: Record<QuickReact, { label: string; emoji: string; color: string; bgColor: string }> = {
  'nailed-it': { label: 'Nailed it', emoji: '\u{1F60A}', color: 'text-green-700', bgColor: 'bg-green-100' },
  'okay': { label: 'Okay', emoji: '\u{1F610}', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  'tough': { label: 'Tough', emoji: '\u{1F61E}', color: 'text-red-700', bgColor: 'bg-red-100' },
}
