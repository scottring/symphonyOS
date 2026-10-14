// What each kid likes, for Math of the day's stories (Scott, 2026-10-14:
// "kids tap topics on the wall"). Up to three per kid, picked from big
// buttons, no typing; each new problem's story is about one of them.
//
// PURE.

import { hashString } from './mathProblem'

export interface MathTopic {
  id: string
  label: string
  /** How the story prompt names it. */
  about: string
}

export const MATH_TOPICS: MathTopic[] = [
  { id: 'dinosaurs', label: 'Dinosaurs', about: 'dinosaurs' },
  { id: 'soccer', label: 'Soccer', about: 'soccer' },
  { id: 'space', label: 'Space', about: 'space and rockets' },
  { id: 'animals', label: 'Animals', about: 'animals and pets' },
  { id: 'baking', label: 'Baking', about: 'baking and cooking' },
  { id: 'games', label: 'Video games', about: 'video games' },
  { id: 'art', label: 'Art', about: 'drawing and art' },
  { id: 'music', label: 'Music', about: 'music and instruments' },
]

export const MAX_TOPICS = 3

const BY_ID = new Map(MATH_TOPICS.map((t) => [t.id, t]))

/** Stored topics, keeping only ones the wall knows, at most three. */
export function parseTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && BY_ID.has(x)))].slice(0, MAX_TOPICS)
}

/** A tap on a topic: on if off, off if on; a fourth replaces the oldest. */
export function toggleTopic(topics: string[], id: string): string[] {
  if (!BY_ID.has(id)) return topics
  if (topics.includes(id)) return topics.filter((t) => t !== id)
  return [...topics, id].slice(-MAX_TOPICS)
}

/** The topic for one problem's story: one of the kid's, the same each time
 *  for the same problem. Null when they haven't picked any. */
export function topicFor(topics: string[], memberId: string, ymd: string, slot: number): MathTopic | null {
  const known = parseTopics(topics)
  if (!known.length) return null
  return BY_ID.get(known[hashString(`${memberId}:${ymd}:${slot}:topic`) % known.length]) ?? null
}

export function topicLabels(topics: string[]): string[] {
  return parseTopics(topics).map((id) => BY_ID.get(id)!.label)
}
