// src/lib/travelChoice.ts
//
// How you're getting to a thing (Scott, 2026-11-11: hover the travel time —
// "how are you getting there?" — walking, biking, driving, Uber, public
// transport). One choice per event, kept on this device; driving until you
// pick. Uber is timed as a drive and said as "by Uber".

import { useSyncExternalStore } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { TravelMode } from '@/types/directions'

export type TravelChoice = 'walking' | 'bicycling' | 'driving' | 'rideshare' | 'transit'

export const TRAVEL_CHOICES: readonly { id: TravelChoice; label: string }[] = [
  { id: 'walking', label: 'Walking' },
  { id: 'bicycling', label: 'Biking' },
  { id: 'driving', label: 'Driving' },
  { id: 'rideshare', label: 'Uber' },
  { id: 'transit', label: 'Public transport' },
]

const PREFIX = 'symphony-travel-mode:'
const EVENT = 'symphony:travel-mode'
const fallback = new Map<string, string>()

/** The key an event's choice is kept under: its calendar id, the same on
 *  the day, in a list row and in its Details card. */
export function travelKey(item: Pick<TimelineItem, 'id' | 'originalEvent'>): string {
  const ev = item.originalEvent as { google_event_id?: string | null; id?: string } | undefined
  return ev ? (ev.google_event_id ?? ev.id ?? item.id) : item.id
}

function isChoice(v: string | null): v is TravelChoice {
  return v === 'walking' || v === 'bicycling' || v === 'driving' || v === 'rideshare' || v === 'transit'
}

export function readTravelChoice(key: string): TravelChoice {
  let v: string | null
  try { v = localStorage.getItem(PREFIX + key) } catch { v = fallback.get(key) ?? null }
  return isChoice(v) ? v : 'driving'
}

export function writeTravelChoice(key: string, choice: TravelChoice) {
  fallback.set(key, choice)
  try {
    if (choice === 'driving') localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, choice)
  } catch { /* still this session */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener) }
}

/** The choice for one event, and a way to change it. */
export function useTravelChoice(key: string): [TravelChoice, (c: TravelChoice) => void] {
  const choice = useSyncExternalStore(subscribe, () => readTravelChoice(key), () => 'driving' as const)
  return [choice, (c) => writeTravelChoice(key, c)]
}

/** The mode the route is timed by. */
export function routeMode(choice: TravelChoice): TravelMode {
  return choice === 'rideshare' ? 'driving' : choice
}
