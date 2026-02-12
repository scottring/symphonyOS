// Coherence check-in types — weekly family alignment reflection

import type { DomainId } from './manual'

export interface CoherenceCheckin {
  id: string
  household_id: string
  user_id: string
  week: string // ISO week string, e.g. "2026-W07"
  responses: Record<string, CheckinResponse> // keyed by manualId
  system_observations: SystemObservation[]
  drift_signals: DriftSignal[]
  created_at: string
}

export interface CheckinResponse {
  manualId: string
  reflectionText: string
  alignmentRating: number // 1-5
  driftNotes?: string
}

export interface SystemObservation {
  id: string
  text: string
  relatedManualIds: string[]
  relatedEntryIds: string[]
  dismissedByUser: boolean
  createdAt: string
}

export interface DriftSignal {
  id: string
  description: string
  manualId: string
  domain: DomainId
  severity: 'gentle' | 'notable'
  acknowledged: boolean
  createdAt: string
}
