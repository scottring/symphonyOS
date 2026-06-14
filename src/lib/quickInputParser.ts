import * as chrono from 'chrono-node'

export interface ParsedQuickInput {
  rawText: string                    // Original input, always preserved
  title: string                      // Extracted title (everything not parsed)
  projectId?: string                 // Matched project
  projectMatch?: string              // What text matched (for highlighting)
  contactId?: string                 // Matched contact
  contactMatch?: string              // What text matched
  dueDate?: Date                     // Parsed date
  dueDateMatch?: string              // What text matched (e.g., "tomorrow")
  priority?: 'high' | 'medium' | 'low'
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  categoryMatch?: string             // What text matched (e.g., "errand:")
  isNote?: boolean                   // True if this is a note (not a task)
  noteContent?: string               // Clean note content (without prefix)
  topicName?: string                 // Topic name if specified with @topic
  assignedMemberIds?: string[]       // Family members assigned via -name
  assignedMatches?: string[]         // What text matched (e.g., ["-scott", "-iris"])
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

export function parseQuickInput(
  input: string,
  context: ParserContext
): ParsedQuickInput {
  const result: ParsedQuickInput = {
    rawText: input,
    title: input.trim(),
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
    // Short aliases
    'ev:': 'event',
    'act:': 'activity',
    'ch:': 'chore',
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

  // 1. Extract dates using chrono-node — skipping weak/ambiguous bare keywords
  //    (see isWeakDateMatch) so topic words like "weekend" or "May" don't
  //    hijack scheduling and mangle the title.
  const dateMatch = chrono.parse(workingText).find((m) => !isWeakDateMatch(m))
  if (dateMatch) {
    result.dueDate = dateMatch.start.date()
    result.dueDateMatch = dateMatch.text
    workingText = workingText.replace(dateMatch.text, '').trim()
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
  return !!(parsed.projectId || parsed.contactId || parsed.dueDate || parsed.priority || parsed.category || parsed.isNote || parsed.assignedMemberIds?.length)
}
