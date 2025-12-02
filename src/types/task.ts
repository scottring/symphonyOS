export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: Date
  scheduledFor?: Date // When this task is scheduled to be done
  notes?: string
  links?: string[]
  phoneNumber?: string
  contactId?: string // Linked contact
}
