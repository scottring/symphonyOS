// Yearbook — a person's living activity book for the year

export interface Yearbook {
  id: string
  household_id: string
  user_id: string
  person_id: string
  year: number
  chapters: YearbookChapter[]
  developmental_baseline?: DevelopmentalBaseline | null
  created_at: string
  updated_at: string
}

export interface YearbookChapter {
  id: string
  title: string
  description?: string
  entryIds: string[]
  period?: { start: string; end: string }
  isActive: boolean
}

export interface DevelopmentalBaseline {
  age: number
  proposedLevel: DevelopmentalLevel
  parentValidated: boolean
  parentAdjustments?: string
  engagementAdjustments?: string[]
  lastAssessed: string
}

export type DevelopmentalLevel = 'early-childhood' | 'middle-childhood' | 'pre-teen' | 'teen' | 'adult'
