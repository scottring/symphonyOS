export type HomeViewType = 'today' | 'today-context' | 'week'

export interface HomeViewPreference {
  userId: string
  preferredView: HomeViewType
  sidebarCollapsed: boolean // for today-context view
}

export interface DayProgress {
  date: Date
  completed: number
  total: number
  tasks: {
    id: string
    title: string
    completed: boolean
    section: 'allday' | 'morning' | 'afternoon' | 'evening'
  }[]
}

export interface ProjectToday {
  id: string
  name: string
  taskCount: number
  dueDate?: Date
  daysUntilDue?: number
}

export interface FamilyMemberToday {
  id: string
  name: string
  initials: string
  taskCount: number
  timeDistribution: {
    morning: number
    afternoon: number
    evening: number
  }
}
