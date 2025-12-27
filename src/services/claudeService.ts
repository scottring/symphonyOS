/**
 * Claude AI Service
 *
 * Integrates with Claude API via Supabase Edge Function to generate
 * intelligent, context-aware packing lists from conversational input.
 */

import type { PackingNode } from '@/types/trip'
import type { WeatherSummary } from './weatherService'

export interface TravelerProfile {
  name: string
  age_range?: string
  allergies?: string[]
  medications?: Array<{ name: string; dosage?: string }>
  dietary_restrictions?: string[]
  health_conditions?: string[]
  mobility_needs?: string
}

export interface PackingContext {
  trip: {
    destination: string
    origin: string
    startDate: string
    endDate: string
    duration_days: number
    events: Array<{
      type: string
      location?: string
      date: string
      details?: string
    }>
  }
  weather: {
    destination: WeatherSummary
    home?: WeatherSummary
  }
  travelers: TravelerProfile[]
  special_needs?: string
}

/**
 * Generate packing list using Claude AI via Supabase Edge Function
 *
 * This calls a server-side edge function which handles the actual AI generation.
 * Returns a structured list of headings and items organized hierarchically.
 */
export async function generatePackingList(context: PackingContext): Promise<PackingNode[]> {
  try {
    // Import supabase client
    const { supabase } = await import('@/lib/supabase')

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('Not authenticated')
    }

    // Call Supabase edge function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-packing-list`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(context)
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Edge function error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    return data.nodes as PackingNode[]
  } catch (error) {
    console.error('Failed to generate packing list:', error)
    throw error
  }
}
