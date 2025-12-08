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
}

export interface ParserContext {
  projects: Array<{ id: string; name: string }>
  contacts: Array<{ id: string; name: string }>
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

  // 1. Extract dates using chrono-node
  const dateResults = chrono.parse(workingText)
  if (dateResults.length > 0) {
    const match = dateResults[0]
    result.dueDate = match.start.date()
    result.dueDateMatch = match.text
    workingText = workingText.replace(match.text, '').trim()
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

  // 5. Clean up title
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
  return !!(parsed.projectId || parsed.contactId || parsed.dueDate || parsed.priority)
}
