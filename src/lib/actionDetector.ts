/**
 * Client-side action detection for fast path
 * Uses regex patterns to detect likely SMS/email actions before calling AI
 * This avoids ~500ms AI latency for non-action task inputs
 */

import type { ActionType } from '@/types/action'

/**
 * Patterns that indicate SMS intent
 */
const SMS_PATTERNS = [
  /^(text|txt|message|sms)(\s+|$)/i,  // "text" alone or "text " with more
  /^send\s+a?\s*(text|txt|message|sms)\s+to\s+/i,
  /^(text|txt|message)\s+\w+\s+(about|regarding|re:|that|to\s+say)/i,
]

/**
 * Patterns that indicate email intent
 */
const EMAIL_PATTERNS = [
  /^email(\s+|$)/i,  // "email" alone or "email " with more
  /^send\s+a?n?\s*email\s+to\s+/i,
  /^email\s+\w+\s+(about|regarding|re:|that|to\s+say)/i,
]

/**
 * Result of client-side action detection
 */
export interface ActionDetectionResult {
  isLikelyAction: boolean
  likelyType?: ActionType
  extractedName?: string // Best-effort name extraction for contact matching
  extractedContent?: string // Content hint (everything after the name)
}

/**
 * Detect if input is likely an action request
 * This is a fast client-side check before calling AI
 */
export function detectAction(input: string): ActionDetectionResult {
  const trimmed = input.trim()

  // Check SMS patterns
  for (const pattern of SMS_PATTERNS) {
    if (pattern.test(trimmed)) {
      const { name, content } = extractNameAndContent(trimmed, 'sms')
      return {
        isLikelyAction: true,
        likelyType: 'sms',
        extractedName: name,
        extractedContent: content,
      }
    }
  }

  // Check email patterns
  for (const pattern of EMAIL_PATTERNS) {
    if (pattern.test(trimmed)) {
      const { name, content } = extractNameAndContent(trimmed, 'email')
      return {
        isLikelyAction: true,
        likelyType: 'email',
        extractedName: name,
        extractedContent: content,
      }
    }
  }

  return { isLikelyAction: false }
}

/**
 * Extract name and content from action input
 * Examples:
 *   "text frank about the leak" -> { name: "frank", content: "about the leak" }
 *   "email john regarding meeting" -> { name: "john", content: "regarding meeting" }
 *   "send a text to sarah that dinner is ready" -> { name: "sarah", content: "that dinner is ready" }
 */
function extractNameAndContent(
  input: string,
  type: ActionType
): { name?: string; content?: string } {
  // Normalize input
  const normalized = input.trim()

  // Pattern: "text/email [name] [about/regarding/that/to say] [content]"
  const actionWord = type === 'sms' ? '(?:text|txt|message|sms)' : 'email'
  const contentStarters = 'about|regarding|re:|that|to\\s+say|saying'

  // Try to match: "text frank about the leak"
  const directPattern = new RegExp(
    `^(?:send\\s+a?n?\\s*)?${actionWord}\\s+([a-z]+)\\s+(${contentStarters})\\s+(.+)$`,
    'i'
  )
  const directMatch = normalized.match(directPattern)
  if (directMatch) {
    return {
      name: directMatch[1].toLowerCase(),
      content: `${directMatch[2]} ${directMatch[3]}`,
    }
  }

  // Try to match: "send a text to frank about the leak"
  const toPattern = new RegExp(
    `^send\\s+a?n?\\s*${actionWord}\\s+to\\s+([a-z]+)\\s*(${contentStarters})?\\s*(.*)$`,
    'i'
  )
  const toMatch = normalized.match(toPattern)
  if (toMatch) {
    const content = toMatch[2] && toMatch[3] ? `${toMatch[2]} ${toMatch[3]}` : toMatch[3]
    return {
      name: toMatch[1].toLowerCase(),
      content: content || undefined,
    }
  }

  // Fallback: just get the first word after action word
  const simplePattern = new RegExp(`^(?:send\\s+a?n?\\s*)?${actionWord}\\s+([a-z]+)`, 'i')
  const simpleMatch = normalized.match(simplePattern)
  if (simpleMatch) {
    // Get everything after the name as content
    const nameEnd = normalized.toLowerCase().indexOf(simpleMatch[1].toLowerCase()) + simpleMatch[1].length
    const remaining = normalized.slice(nameEnd).trim()
    return {
      name: simpleMatch[1].toLowerCase(),
      content: remaining || undefined,
    }
  }

  return {}
}

/**
 * Find matching contacts by name (case-insensitive, partial match)
 */
export function findMatchingContacts<T extends { id: string; name: string; phone?: string; email?: string }>(
  contacts: T[],
  searchName: string,
  actionType: ActionType
): T[] {
  const search = searchName.toLowerCase()

  // Filter contacts that match the name and have required contact info
  const matches = contacts.filter((contact) => {
    const name = contact.name.toLowerCase()

    // Check if name matches (starts with, or first/last name match)
    const nameMatches =
      name.startsWith(search) ||
      name.split(' ').some((part) => part.startsWith(search))

    if (!nameMatches) return false

    // Check if contact has required info for action type
    if (actionType === 'sms' && !contact.phone) return false
    if (actionType === 'email' && !contact.email) return false

    return true
  })

  // Sort by relevance (exact first name match first, then partial)
  return matches.sort((a, b) => {
    const aFirstName = a.name.toLowerCase().split(' ')[0]
    const bFirstName = b.name.toLowerCase().split(' ')[0]

    // Exact first name match gets priority
    if (aFirstName === search && bFirstName !== search) return -1
    if (bFirstName === search && aFirstName !== search) return 1

    // Then by name length (shorter = more specific)
    return a.name.length - b.name.length
  })
}
