export type Severity = 1 | 2 | 3

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Mild',
  2: 'Moderate',
  3: 'Severe',
}

export interface Symptom {
  id: string
  userId: string
  name: string
  active: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface SymptomLog {
  id: string
  symptomId: string
  severity: Severity
  loggedAt: Date
  note?: string
  createdAt: Date
}
