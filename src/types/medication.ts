export type MedSource = 'siri' | 'shortcut' | 'web' | 'manual'

export interface Medication {
  id: string
  userId: string
  name: string
  strength?: string
  scheduleTimes: string[] // local "HH:MM", sorted ascending by convention
  active: boolean
  notes?: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface MedicationLog {
  id: string
  medicationId: string
  takenAt: Date
  source: MedSource
  note?: string
  createdAt: Date
}
