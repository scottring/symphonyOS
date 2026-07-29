import type { BundleFact } from '../../_shared/context-graph/types.ts'

export interface FacetSuggestion {
  entity_type: 'task'
  entity_id: string
  suggestion_type: 'call' | 'open_link'
  title: string
  detail: string
  confidence: number
  action_type: 'call' | 'open_link'
  action_payload: Record<string, unknown>
  suggestion_key: string
}

export function facetRuleSuggestions(
  task: { id: string; title: string; phone_number: string | null },
  facts: BundleFact[]
): FacetSuggestion[] {
  const suggestions: FacetSuggestion[] = []

  // Rule 1: First phone facet on a task without its own phone_number
  if (!task.phone_number) {
    const phoneFact = facts.find((f) => f.facet.type === 'phone')
    if (phoneFact && phoneFact.facet.type === 'phone') {
      const label = phoneFact.facet.label || 'number from attachment'
      suggestions.push({
        entity_type: 'task',
        entity_id: task.id,
        suggestion_type: 'call',
        title: `Call ${label}`,
        detail: 'Number found on an attached photo/document',
        confidence: 0.85,
        action_type: 'call',
        action_payload: { phoneNumber: phoneFact.facet.number },
        suggestion_key: `task:${task.id}:rule:facet_call`,
      })
    }
  }

  // Rule 2: First link facet
  const linkFact = facts.find((f) => f.facet.type === 'link')
  if (linkFact && linkFact.facet.type === 'link') {
    suggestions.push({
      entity_type: 'task',
      entity_id: task.id,
      suggestion_type: 'open_link',
      title: linkFact.facet.label ? `Open ${linkFact.facet.label}` : 'Open link',
      detail: 'Found on an attached photo/document',
      confidence: 0.7,
      action_type: 'open_link',
      action_payload: { url: linkFact.facet.url },
      suggestion_key: `task:${task.id}:rule:facet_link`,
    })
  }

  return suggestions
}
