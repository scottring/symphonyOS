// Yearbook — a person's living activity book organized as a weekly progress journal

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
  // Weekly journal extensions
  weekNumber?: number
  progress?: WeeklyProgress
}

// Tracks what happened during a week — assessment changes, Symphony completions, harmony shifts
export interface WeeklyProgress {
  harmonySnapshot: Partial<Record<string, number>>   // domainId → score at week start
  harmonyChanges: Partial<Record<string, number>>     // domainId → delta
  actionsCompleted: string[]                          // assessment_action ids completed this week
  symphonyItemsCompleted: string[]                    // task/project/routine ids completed
  domainsAssessed: string[]                           // domains assessed or reassessed this week
  highlights: string[]                                // AI-generated highlight sentences
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

// Helper: get the ISO week number for a date
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Helper: get start (Monday) and end (Sunday) of a given ISO week
export function getWeekRange(year: number, weekNum: number): { start: string; end: string } {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1Day = jan1.getUTCDay() || 7
  const mondayOfWeek1 = new Date(jan1)
  mondayOfWeek1.setUTCDate(jan1.getUTCDate() + (1 - jan1Day))
  if (jan1Day > 4) mondayOfWeek1.setUTCDate(mondayOfWeek1.getUTCDate() + 7)

  const weekStart = new Date(mondayOfWeek1)
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

  return {
    start: weekStart.toISOString().slice(0, 10),
    end: weekEnd.toISOString().slice(0, 10),
  }
}
