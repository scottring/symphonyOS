import type { TimelineItem } from '@/types/timeline'
import type { FamilyRule } from '@/types/playbook'
import { LAYER_HUB_CONFIGS } from '@/config/layers'

export interface CoachingMatch {
  rule: FamilyRule
  relevance: 'strong' | 'related'
  layerName: string
  layerColor: string // Tailwind border color class
  categoryLabel: string
}

/**
 * Map a TaskContext to the primary intelligence layer slug.
 */
function contextToLayerSlug(context: string | null | undefined): string | null {
  switch (context) {
    case 'family':
      return 'relish'
    case 'work':
      return 'work'
    case 'personal':
      return 'wellness'
    default:
      return null
  }
}

/**
 * Infer rule categories that are relevant based on time of day.
 */
function getTimeCategorySlugs(startTime: Date | null): string[] {
  if (!startTime) return []
  const hour = startTime.getHours()

  if (hour < 9) return ['morning']
  if (hour < 12) return ['focus-blocks', 'activities', 'homework']
  if (hour < 17) return ['meals', 'activities', 'meetings', 'focus-blocks']
  if (hour < 20) return ['meals', 'evening', 'activities', 'bedtime']
  return ['bedtime', 'evening']
}

/**
 * Get the human-readable label for a rule category within a layer.
 */
function getCategoryLabel(layerSlug: string, categorySlug: string | null): string {
  if (!categorySlug) return 'General'
  const config = LAYER_HUB_CONFIGS[layerSlug]
  if (!config) return categorySlug
  const cat = config.ruleCategories.find((c) => c.slug === categorySlug)
  return cat?.label ?? categorySlug
}

/**
 * Match coaching rules to a timeline item based on context (layer) and time (category).
 * Returns the top relevant rules, limited to avoid overwhelming the user.
 */
export function getCoachingForItem(
  item: TimelineItem,
  rules: FamilyRule[],
  hideCoaching: boolean
): CoachingMatch[] {
  if (hideCoaching) return []
  if (rules.length === 0) return []

  // Only match active rules
  const activeRules = rules.filter((r) => r.status === 'active')
  if (activeRules.length === 0) return []

  const layerSlug = contextToLayerSlug(item.context)
  if (!layerSlug) return []

  const config = LAYER_HUB_CONFIGS[layerSlug]
  if (!config) return []

  const timeCategorySlugs = getTimeCategorySlugs(item.startTime)

  // Find the layer's DB id by matching layerId on rules. Get all rules for this layer.
  // Rules have layerId (uuid) not slug, so we match by checking the layer config's rule categories.
  const layerCategorySlugs = new Set(config.ruleCategories.map((c) => c.slug))

  const matches: CoachingMatch[] = []

  for (const rule of activeRules) {
    // Check if rule belongs to this layer's categories
    const ruleCategory = rule.category
    if (!ruleCategory || !layerCategorySlugs.has(ruleCategory)) continue

    // Check if rule has an enforcement tip (that's the coaching content)
    if (!rule.enforcementTip && !rule.rule) continue

    // Strong match = layer match + time-relevant category
    const isTimeRelevant = timeCategorySlugs.includes(ruleCategory)

    matches.push({
      rule,
      relevance: isTimeRelevant ? 'strong' : 'related',
      layerName: config.name,
      layerColor: config.borderColor,
      categoryLabel: getCategoryLabel(layerSlug, ruleCategory),
    })
  }

  // Sort: strong matches first, then by category sort order
  matches.sort((a, b) => {
    if (a.relevance !== b.relevance) {
      return a.relevance === 'strong' ? -1 : 1
    }
    return 0
  })

  // Return top 3 matches max
  return matches.slice(0, 3)
}

/**
 * Quick check: does an item have any potential coaching matches?
 * Used for the sparkle indicator — avoids full match computation.
 */
export function hasCoachingForItem(
  item: TimelineItem,
  rules: FamilyRule[]
): boolean {
  if (rules.length === 0) return false

  const layerSlug = contextToLayerSlug(item.context)
  if (!layerSlug) return false

  const config = LAYER_HUB_CONFIGS[layerSlug]
  if (!config) return false

  const layerCategorySlugs = new Set(config.ruleCategories.map((c) => c.slug))

  return rules.some(
    (r) =>
      r.status === 'active' &&
      r.category &&
      layerCategorySlugs.has(r.category) &&
      (r.enforcementTip || r.rule)
  )
}
