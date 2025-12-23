/**
 * Outcome-oriented language coaching utilities
 * Helps users write clear, deliverable-focused descriptions
 * instead of vague, process-oriented language
 */

export interface VaguePattern {
  type: 'vague_noun' | 'vague_action' | 'process_oriented'
  detected: string
  tip: string
  examples: string[]
}

export interface LanguageAnalysis {
  isVague: boolean
  patterns: VaguePattern[]
}

/**
 * Analyze text for vague language patterns
 * Phase 1: Simple regex-based detection
 */
export function analyzeLanguage(text: string): LanguageAnalysis {
  const lower = text.toLowerCase().trim()
  const patterns: VaguePattern[] = []

  // Vague nouns - generic placeholders
  if (/\b(tasks?|stuff|things?)\b/.test(lower)) {
    const match = lower.match(/\b(tasks?|stuff|things?)\b/)?.[0]
    patterns.push({
      type: 'vague_noun',
      detected: match || 'generic term',
      tip: 'Try describing what specific outcome you\'ll deliver',
      examples: [
        'Instead of "timeline tasks" → "Drag-and-drop timeline editor"',
        'Instead of "auth stuff" → "Google OAuth login flow"',
        'Instead of "UI things" → "Mobile-responsive navigation menu"',
      ],
    })
  }

  // Process-oriented actions
  if (/\b(work on|working on|deal with|dealing with|handle|handling)\b/.test(lower)) {
    const match = lower.match(/\b(work on|working on|deal with|dealing with|handle|handling)\b/)?.[0]
    patterns.push({
      type: 'process_oriented',
      detected: match || 'process verb',
      tip: 'Focus on what gets shipped, not the process',
      examples: [
        'Instead of "Work on homepage" → "Homepage hero section with CTA"',
        'Instead of "Handle email integration" → "Send welcome emails on signup"',
        'Instead of "Deal with performance" → "Reduce page load time to <2s"',
      ],
    })
  }

  // Vague actions - could be more specific
  if (/\b(update|updating|fix|fixing|improve|improving|refactor|refactoring)\b/.test(lower) && !lower.includes(' to ') && !lower.includes(' for ')) {
    const match = lower.match(/\b(update|updating|fix|fixing|improve|improving|refactor|refactoring)\b/)?.[0]
    patterns.push({
      type: 'vague_action',
      detected: match || 'vague verb',
      tip: 'Specify the outcome - what will be different after?',
      examples: [
        'Instead of "Update dashboard" → "Dashboard shows last 30 days of activity"',
        'Instead of "Fix search" → "Search returns results in <200ms"',
        'Instead of "Improve UX" → "One-click checkout flow"',
      ],
    })
  }

  return {
    isVague: patterns.length > 0,
    patterns,
  }
}

/**
 * Get a concise coaching message for the first detected pattern
 */
export function getCoachingMessage(analysis: LanguageAnalysis): string | null {
  if (!analysis.isVague || analysis.patterns.length === 0) {
    return null
  }

  const pattern = analysis.patterns[0]
  return pattern.tip
}

/**
 * Get examples for the first detected pattern
 */
export function getExamples(analysis: LanguageAnalysis): string[] {
  if (!analysis.isVague || analysis.patterns.length === 0) {
    return []
  }

  return analysis.patterns[0].examples
}
