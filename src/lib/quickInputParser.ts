import * as chrono from 'chrono-node'
import { DOMAINS } from '@/lib/domains'
import type { TaskContext } from '@/types/task'

export interface ParsedQuickInput {
  rawText: string                    // Original input, always preserved
  title: string                      // Extracted title (everything not parsed)
  projectId?: string                 // Matched project
  projectMatch?: string              // What text matched (for highlighting)
  contactId?: string                 // Matched contact
  contactMatch?: string              // What text matched
  dueDate?: Date                     // Parsed date
  dueDateMatch?: string              // What text matched (e.g., "tomorrow")
  hasTime: boolean                   // True only when chrono was certain of an hour (vs. a date-only match)
  durationMinutes?: number           // Parsed duration ("45m", "1h30m", "for 45 minutes", or a chrono range)
  durationMatch?: string             // What text matched (e.g., "45m")
  priority?: 'high' | 'medium' | 'low'
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity' | 'homework'
  categoryMatch?: string             // What text matched (e.g., "errand:")
  context?: TaskContext              // Domain stamped by an explicit #work/#family/#personal token
  contextMatch?: string              // What text matched (e.g., "#work")
  isNote?: boolean                   // True if this is a note (not a task)
  noteContent?: string               // Clean note content (without prefix)
  topicName?: string                 // Topic name if specified with @topic
  assignedMemberIds?: string[]       // Family members assigned via -name
  assignedMatches?: string[]         // What text matched (e.g., ["-scott", "-iris"])
}

/**
 * All-day, from a parse. THE rule for every quick-add call site, because
 * getting it wrong is invisible: a date-only match has its time zeroed above,
 * so a task filed with `isAllDay: false` for "Finish the deck for Monday"
 * lands as a timed block at 12:00 AM rather than a chip on the day.
 *
 * `undefined` means the parse named no day at all — the caller decides what
 * its own default day implies (Today's inline add: all-day).
 */
export function allDayFromParse(parsed: Pick<ParsedQuickInput, 'dueDate' | 'hasTime'>): boolean | undefined {
  return parsed.dueDate ? !parsed.hasTime : undefined
}

export interface ParserContext {
  projects: Array<{ id: string; name: string }>
  contacts: Array<{ id: string; name: string }>
  familyMembers?: Array<{ id: string; name: string }>
}

// Bare keywords chrono-node will happily read as a date but which are, far more
// often, topic words: "text Karen re weekend", "May invoices", "the March
// numbers". Treating them as scheduling intent silently reschedules the task and
// strips the word from the title — a real reported data-loss bug. We only reject
// them when they appear ALONE (no time, no number); a real scheduling cue keeps
// the match strong because chrono includes the cue in the matched text
// ("this weekend", "next May", "May 15"), so it's no longer a bare keyword.
const AMBIGUOUS_BARE_DATE = new Set([
  'weekend', 'weekends',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
])

function isWeakDateMatch(match: chrono.ParsedResult): boolean {
  const text = match.text.trim().toLowerCase()
  // Strong if it pins an explicit time ("Friday 1pm") or carries a number
  // ("May 15", "6/15") — those signal real intent.
  if (match.start.isCertain('hour') || /\d/.test(text)) return false
  return AMBIGUOUS_BARE_DATE.has(text)
}

// ── Time resolution ─────────────────────────────────────────────────────────
// chrono is a good date reader and a poor household mind-reader. Two of its
// defaults produced the "wait, did it understand me?" moments in the
// 2026-09-04 launch rehearsal, and both are fixed here rather than by
// abandoning chrono:
//
//   "Pick up Michael from soccer at 6" -> 6:00 AM.  A bare hour with no
//   meridiem is left as written, and 6 means 6am. Nobody collects a kid from
//   soccer at dawn.
//
//   "dentist thu 2pm" typed on a Friday -> LAST Thursday, a date in the past,
//   which then reads as overdue the moment it is created. chrono resolves a
//   bare weekday to the CLOSEST one in either direction.

/** Bare hours at or below this are read as PM ("at 6" -> 6:00 PM).
 *  1am-6am is almost never what someone means when they omit the meridiem;
 *  7 and up is genuinely ambiguous (7am school run vs 7pm dinner) and is left
 *  alone. Matches the older parseNaturalDate heuristic so the two agree. */
const BARE_HOUR_PM_CEILING = 6

/** Did the text pin an actual calendar date ("Sept 1", "3/15", "yesterday")?
 *  Those are explicit — a past one is deliberate, and rolling it forward would
 *  turn "sept 1 review" into September 2027. */
function namesCalendarDate(m: chrono.ParsedResult): boolean {
  return m.start.isCertain('day') || m.start.isCertain('month') || m.start.isCertain('year')
}

/**
 * chrono's date for a match, corrected for a household planner.
 *
 * @param match    the plain parse
 * @param forward  the same match re-parsed with chrono's forwardDate option,
 *                 if it survived that parse
 * @param now      reference time
 */
function resolveDateMatch(
  match: chrono.ParsedResult,
  forward: chrono.ParsedResult | undefined,
  now: Date,
): Date {
  const bumpToPm = (d: Date) => {
    // Only when the writer left the meridiem out AND actually named an hour.
    if (!match.start.isCertain('hour') || match.start.isCertain('meridiem')) return d
    const h = d.getHours()
    if (h < 1 || h > BARE_HOUR_PM_CEILING) return d
    const out = new Date(d)
    out.setHours(h + 12)
    return out
  }

  const plain = bumpToPm(match.start.date())
  if (plain >= now) return plain

  // The corrected time is still behind us. If the writer named a real date,
  // they meant it — leave it (Expired work is reachable from the inbox).
  if (namesCalendarDate(match)) return plain

  // Otherwise it was a weekday or a bare time, which chrono resolved
  // backwards. Take chrono's own forward-looking reading of the same text.
  return forward ? bumpToPm(forward.start.date()) : plain
}

// Explicit domain tokens: "#work", "#family", "#personal". The ids come from
// DOMAINS so this can never drift from the domain registry (and so nothing here
// enumerates the three ids by hand). \b keeps "#workout" and "#personality"
// out; the leading group preserves the whitespace we splice back into the title.
const CONTEXT_TOKEN_RE = new RegExp(`(^|\\s)#(${DOMAINS.map((d) => d.id).join('|')})\\b`, 'i')

export function parseQuickInput(
  input: string,
  context: ParserContext
): ParsedQuickInput {
  const result: ParsedQuickInput = {
    rawText: input,
    title: input.trim(),
    hasTime: false,
  }

  let workingText = input

  // Helper for normalized string comparison
  const normalizeStr = (s: string) => s.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()

  // 0a. Check for note prefix FIRST (takes precedence over everything)
  const notePrefixes = ['note:', 'journal:', 'log:', 'n:']
  for (const prefix of notePrefixes) {
    if (workingText.toLowerCase().startsWith(prefix)) {
      result.isNote = true
      workingText = workingText.slice(prefix.length).trim()

      // Check for @topic syntax: "note @health: content" or "note @health content"
      const topicMatch = workingText.match(/^@(\S+):?\s*/)
      if (topicMatch) {
        result.topicName = topicMatch[1]
        workingText = workingText.slice(topicMatch[0].length).trim()
      }

      // For notes, store the clean content and skip other parsing
      result.noteContent = workingText
      result.title = workingText
      return result
    }
  }

  // 0. Check for category prefix (must be at start of input)
  const categoryPrefixes: Record<string, ParsedQuickInput['category']> = {
    'event:': 'event',
    'activity:': 'activity',
    'chore:': 'chore',
    'errand:': 'errand',
    'task:': 'task',
    'homework:': 'homework',
    // Short aliases
    'ev:': 'event',
    'act:': 'activity',
    'ch:': 'chore',
    'hw:': 'homework',
    'er:': 'errand',
  }

  for (const [prefix, category] of Object.entries(categoryPrefixes)) {
    if (workingText.toLowerCase().startsWith(prefix)) {
      result.category = category
      result.categoryMatch = workingText.slice(0, prefix.length)
      workingText = workingText.slice(prefix.length).trim()
      break
    }
  }

  // 0b. Extract an explicit duration token BEFORE date parsing so chrono never
  //     misreads "for 45 minutes" as a relative date. Supported: "45m",
  //     "45 min(s)/minutes", "1h/hr/hour(s)", "1h30m", "1.5h", each optionally
  //     preceded by "for". The minutes-only branch requires the unit to touch a
  //     word boundary, so times like "2pm" and words like "45 miles" don't match.
  const durationMatch = workingText.match(
    /(?:^|\s)(in\s+)?(?:for\s+)?((\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?(?:\s*(\d{1,2})\s*m(?:ins?|inutes?)?)?|(\d{1,3})\s*m(?:ins?|inutes?)?)(?=[\s,.]|$)/i,
  )
  // "in 45 minutes" is a relative TIME (chrono's job), not a duration — skip it.
  if (durationMatch && !durationMatch[1]) {
    const hours = durationMatch[3] ? parseFloat(durationMatch[3]) : 0
    const minsAfterHours = durationMatch[4] ? parseInt(durationMatch[4], 10) : 0
    const minsOnly = durationMatch[5] ? parseInt(durationMatch[5], 10) : 0
    const total = Math.round(hours * 60) + minsAfterHours + minsOnly
    if (total > 0) {
      result.durationMinutes = total
      result.durationMatch = durationMatch[2]
      workingText = workingText.replace(durationMatch[0], ' ').replace(/\s+/g, ' ').trim()
    }
  }

  // 1. Extract dates using chrono-node — skipping weak/ambiguous bare keywords
  //    (see isWeakDateMatch) so topic words like "weekend" or "May" don't
  //    hijack scheduling and mangle the title. resolveDateMatch then applies
  //    the two household corrections chrono does not make on its own (bare
  //    evening hours, and weekday names that resolve backwards).
  const now = new Date()
  const dateMatch = chrono.parse(workingText, now).find((m) => !isWeakDateMatch(m))
  if (dateMatch) {
    const forward = chrono.parse(workingText, now, { forwardDate: true }).find((m) => m.text === dateMatch.text)
    result.dueDate = resolveDateMatch(dateMatch, forward, now)
    result.dueDateMatch = dateMatch.text
    result.hasTime = dateMatch.start.isCertain('hour')
    if (!result.hasTime) {
      result.dueDate.setHours(0, 0, 0, 0)
    }
    workingText = workingText.replace(dateMatch.text, '').trim()
    // The date text is gone, but the preposition that introduced it often
    // isn't ("Finish the deck for Monday" -> "Finish the deck for"). Strip a
    // trailing preposition left dangling at the end of the remaining text.
    workingText = workingText.replace(/\s+(for|on|by|until|till|at)\s*$/i, '').trim()
    // A chrono range ("2pm-3:30pm") carries the end time — derive a duration
    // from it unless an explicit duration token already won.
    if (dateMatch.end && result.durationMinutes === undefined) {
      const rangeMinutes = Math.round((dateMatch.end.date().getTime() - dateMatch.start.date().getTime()) / 60000)
      if (rangeMinutes > 0) result.durationMinutes = rangeMinutes
    }
  }

  // 2. Check for explicit contact markers FIRST (before projects)
  // This prevents "with X" from being swallowed by greedy project patterns

  // First try @mention pattern (can appear anywhere)
  const atMentionMatch = workingText.match(/@(\S+)/i)
  if (atMentionMatch) {
    const contactQuery = atMentionMatch[1].toLowerCase()
    const matchedContact = context.contacts.find(c =>
      c.name.toLowerCase().includes(contactQuery) ||
      contactQuery.includes(c.name.toLowerCase())
    )
    if (matchedContact) {
      result.contactId = matchedContact.id
      result.contactMatch = atMentionMatch[0]
      workingText = workingText.replace(atMentionMatch[0], '').trim()
    }
  }

  // Then try "with [Contact]" at end of string (if no contact found yet)
  if (!result.contactId) {
    const withMatch = workingText.match(/\bwith\s+(.+)$/i)
    if (withMatch) {
      const contactQuery = withMatch[1].trim().toLowerCase()
      const normalizedQuery = normalizeStr(contactQuery)
      const matchedContact = context.contacts.find(c => {
        const normalizedName = normalizeStr(c.name)
        return normalizedName === normalizedQuery ||
          normalizedName.includes(normalizedQuery) ||
          normalizedQuery.includes(normalizedName)
      })
      if (matchedContact) {
        result.contactId = matchedContact.id
        result.contactMatch = withMatch[0]
        workingText = workingText.replace(withMatch[0], '').trim()
      }
    }
  }

  // 2b. Explicit domain token. RESERVED — matched BEFORE the #project pattern
  //      below, so a project that happens to share a domain's name can never
  //      shadow the context token. This is the only way text stamps a context:
  //      captures still never inherit the domain lens.
  const contextTokenMatch = workingText.match(CONTEXT_TOKEN_RE)
  if (contextTokenMatch) {
    result.context = contextTokenMatch[2].toLowerCase() as TaskContext
    result.contextMatch = `#${contextTokenMatch[2]}`
    workingText = workingText.replace(CONTEXT_TOKEN_RE, '$1').replace(/\s+/g, ' ').trim()
  }

  // 3. Check for explicit project markers: #project, "in Project", "for Project"
  // Pattern: #ProjectName or "in/for [Project Name]"
  const projectPatterns = [
    /#(\S+)/i,                                    // #project
    /\b(?:in|for)\s+(?:project\s+)?["']?([^"']+?)["']?\s*(?:project)?$/i,
    /\b(?:in|for)\s+(\S+)\s+project\b/i,
  ]

  for (const pattern of projectPatterns) {
    const match = workingText.match(pattern)
    if (match) {
      const projectQuery = match[1].toLowerCase()
      // Fuzzy match against existing projects
      const matchedProject = context.projects.find(p =>
        p.name.toLowerCase().includes(projectQuery) ||
        projectQuery.includes(p.name.toLowerCase())
      )
      if (matchedProject) {
        result.projectId = matchedProject.id
        result.projectMatch = match[0]
        workingText = workingText.replace(match[0], '').trim()
        break
      }
    }
  }

  // 4. Check for priority markers
  // Check for !! (double exclamation) or urgent/high priority keywords
  if (/!!/.test(workingText) || /\b(urgent|high\s*priority)\b/i.test(workingText)) {
    result.priority = 'high'
    workingText = workingText.replace(/!!/g, '').replace(/\b(urgent|high\s*priority)\b/gi, '').trim()
  } else if (/\b(medium\s*priority)\b/i.test(workingText)) {
    result.priority = 'medium'
    workingText = workingText.replace(/\b(medium\s*priority)\b/i, '').trim()
  }

  // 5. Check for -name assignment patterns (e.g., "-scott", "-iris -scott")
  if (context.familyMembers && context.familyMembers.length > 0) {
    const assignedIds: string[] = []
    const assignedMatches: string[] = []

    // Match all -name patterns (word boundary, not part of a longer hyphenated word)
    const dashNameRegex = /(?:^|\s)-(\S+)/gi
    let dashMatch: RegExpExecArray | null
    while ((dashMatch = dashNameRegex.exec(workingText)) !== null) {
      const nameQuery = dashMatch[1].toLowerCase()
      const member = context.familyMembers.find(m => {
        const firstName = m.name.split(/\s+/)[0].toLowerCase()
        return firstName === nameQuery || m.name.toLowerCase() === nameQuery
      })
      if (member && !assignedIds.includes(member.id)) {
        assignedIds.push(member.id)
        assignedMatches.push(dashMatch[0].trimStart()) // e.g., "-scott"
      }
    }

    if (assignedIds.length > 0) {
      result.assignedMemberIds = assignedIds
      result.assignedMatches = assignedMatches
      // Remove matched patterns from working text
      for (const match of assignedMatches) {
        workingText = workingText.replace(match, '')
      }
      workingText = workingText.replace(/\s+/g, ' ').trim()
    }
  }

  // 6. Clean up title
  result.title = workingText
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/^[-–—]\s*/, '')       // Remove leading dashes
    .trim()

  // If title is empty after parsing, use original
  if (!result.title) {
    result.title = input.trim()
  }

  return result
}

// Helper to check if anything was parsed beyond the title
export function hasParsedFields(parsed: ParsedQuickInput): boolean {
  return !!(parsed.projectId || parsed.contactId || parsed.dueDate || parsed.durationMinutes || parsed.priority || parsed.category || parsed.context || parsed.isNote || parsed.assignedMemberIds?.length)
}
