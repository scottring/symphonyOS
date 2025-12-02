export interface TaskLink {
  url: string
  title?: string // Fetched page title, falls back to URL if not available
}

export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: Date
  scheduledFor?: Date // When this task is scheduled to be done
  notes?: string
  links?: TaskLink[]
  phoneNumber?: string
  contactId?: string // Linked contact
  projectId?: string // Linked project
}
