// Per-layer configuration: domains, rule categories, theming.
// Adding a new layer = adding a new entry here. No code changes needed in components.

export interface LayerDomainConfig {
  slug: string
  name: string
  subtitle: string
  promptQuestion: string        // "Biggest challenge?" shown in quick assessment
}

export interface LayerRuleCategoryConfig {
  slug: string
  label: string
  sortOrder: number
}

export interface LayerHubConfig {
  slug: string
  name: string
  tagline: string
  color: string                 // Tailwind text color class
  bgColor: string               // Tailwind bg color class
  borderColor: string            // Tailwind border color class
  accentColor: string            // Tailwind accent for score bars, etc.
  domains: LayerDomainConfig[]
  ruleCategories: LayerRuleCategoryConfig[]
  rulesLabel: string             // "Family Rules", "Work Standards", etc.
  rulesDescription: string
}

// ── Relish (Family / Household Harmony) ────────────────────────────

const RELISH_DOMAINS: LayerDomainConfig[] = [
  {
    slug: 'values',
    name: 'Values & Identity',
    subtitle: 'What your family stands for',
    promptQuestion: 'Biggest challenge?',
  },
  {
    slug: 'communication',
    name: 'Communication',
    subtitle: 'How you talk and listen',
    promptQuestion: 'Where does communication break down?',
  },
  {
    slug: 'conflict',
    name: 'Conflict Resolution',
    subtitle: 'How you handle disagreements',
    promptQuestion: 'What triggers the hardest conflicts?',
  },
  {
    slug: 'roles',
    name: 'Roles & Balance',
    subtitle: 'How responsibilities are shared',
    promptQuestion: 'Where is the biggest imbalance?',
  },
  {
    slug: 'organization',
    name: 'Organization',
    subtitle: 'How your household runs',
    promptQuestion: 'What falls through the cracks?',
  },
  {
    slug: 'connection',
    name: 'Connection',
    subtitle: 'Quality of relationships',
    promptQuestion: 'Who needs more attention?',
  },
  {
    slug: 'boundaries',
    name: 'Boundaries',
    subtitle: 'Rules, screens, behavior',
    promptQuestion: 'Where are boundaries weakest?',
  },
  {
    slug: 'growth',
    name: 'Growth & Fun',
    subtitle: 'Learning and joy together',
    promptQuestion: 'What would make family time more fun?',
  },
]

const RELISH_RULE_CATEGORIES: LayerRuleCategoryConfig[] = [
  { slug: 'morning', label: 'Morning', sortOrder: 0 },
  { slug: 'screens', label: 'Screens', sortOrder: 1 },
  { slug: 'meals', label: 'Meals', sortOrder: 2 },
  { slug: 'bedtime', label: 'Bedtime', sortOrder: 3 },
  { slug: 'activities', label: 'Activities', sortOrder: 4 },
  { slug: 'behavior', label: 'Behavior', sortOrder: 5 },
  { slug: 'homework', label: 'Homework', sortOrder: 6 },
  { slug: 'general', label: 'General', sortOrder: 7 },
]

const RELISH_CONFIG: LayerHubConfig = {
  slug: 'relish',
  name: 'Relish',
  tagline: 'Family coaching for your household',
  color: 'text-amber-700',
  bgColor: 'bg-amber-50',
  borderColor: 'border-amber-200',
  accentColor: 'bg-amber-500',
  domains: RELISH_DOMAINS,
  ruleCategories: RELISH_RULE_CATEGORIES,
  rulesLabel: 'Family Rules',
  rulesDescription: 'Coaching guidance for everyday moments',
}

// ── Organization ───────────────────────────────────────────────────

const ORGANIZATION_CONFIG: LayerHubConfig = {
  slug: 'organization',
  name: 'Organization',
  tagline: 'Space, systems, and calendar clarity',
  color: 'text-slate-700',
  bgColor: 'bg-slate-50',
  borderColor: 'border-slate-200',
  accentColor: 'bg-slate-500',
  domains: [
    { slug: 'spaces', name: 'Spaces', subtitle: 'Physical environment', promptQuestion: 'Which space needs the most attention?' },
    { slug: 'systems', name: 'Systems', subtitle: 'Recurring workflows', promptQuestion: 'What process breaks down most often?' },
    { slug: 'calendar', name: 'Calendar', subtitle: 'Time allocation', promptQuestion: 'Where does time get wasted?' },
    { slug: 'digital', name: 'Digital', subtitle: 'Files, apps, notifications', promptQuestion: 'What digital clutter bothers you most?' },
  ],
  ruleCategories: [
    { slug: 'daily-reset', label: 'Daily Reset', sortOrder: 0 },
    { slug: 'weekly-maintenance', label: 'Weekly Maintenance', sortOrder: 1 },
    { slug: 'seasonal', label: 'Seasonal', sortOrder: 2 },
    { slug: 'general', label: 'General', sortOrder: 3 },
  ],
  rulesLabel: 'Organization Standards',
  rulesDescription: 'Systems and habits that keep things running',
}

// ── Work Focus ─────────────────────────────────────────────────────

const WORK_CONFIG: LayerHubConfig = {
  slug: 'work',
  name: 'Work Focus',
  tagline: 'Deep work, meetings, and professional growth',
  color: 'text-blue-700',
  bgColor: 'bg-blue-50',
  borderColor: 'border-blue-200',
  accentColor: 'bg-blue-500',
  domains: [
    { slug: 'deep-work', name: 'Deep Work', subtitle: 'Focused creation time', promptQuestion: 'What interrupts your focus most?' },
    { slug: 'meetings', name: 'Meetings', subtitle: 'Collaboration quality', promptQuestion: 'Which meetings feel wasteful?' },
    { slug: 'priorities', name: 'Priorities', subtitle: 'Clarity on what matters', promptQuestion: 'Where are you spread too thin?' },
    { slug: 'energy', name: 'Energy', subtitle: 'Sustainable pace', promptQuestion: 'When do you hit a wall?' },
  ],
  ruleCategories: [
    { slug: 'focus-blocks', label: 'Focus Blocks', sortOrder: 0 },
    { slug: 'meetings', label: 'Meetings', sortOrder: 1 },
    { slug: 'communication', label: 'Communication', sortOrder: 2 },
    { slug: 'boundaries', label: 'Boundaries', sortOrder: 3 },
    { slug: 'general', label: 'General', sortOrder: 4 },
  ],
  rulesLabel: 'Work Standards',
  rulesDescription: 'Principles for productive work',
}

// ── Wellness ───────────────────────────────────────────────────────

const WELLNESS_CONFIG: LayerHubConfig = {
  slug: 'wellness',
  name: 'Wellness',
  tagline: 'Movement, rest, and mental health',
  color: 'text-green-700',
  bgColor: 'bg-green-50',
  borderColor: 'border-green-200',
  accentColor: 'bg-green-500',
  domains: [
    { slug: 'movement', name: 'Movement', subtitle: 'Physical activity', promptQuestion: 'What keeps you from moving more?' },
    { slug: 'sleep', name: 'Sleep', subtitle: 'Rest and recovery', promptQuestion: 'What disrupts your sleep?' },
    { slug: 'nutrition', name: 'Nutrition', subtitle: 'What you eat', promptQuestion: 'Where do eating habits break down?' },
    { slug: 'mindfulness', name: 'Mindfulness', subtitle: 'Mental clarity', promptQuestion: 'When does stress peak?' },
  ],
  ruleCategories: [
    { slug: 'morning', label: 'Morning', sortOrder: 0 },
    { slug: 'exercise', label: 'Exercise', sortOrder: 1 },
    { slug: 'meals', label: 'Meals', sortOrder: 2 },
    { slug: 'evening', label: 'Evening', sortOrder: 3 },
    { slug: 'general', label: 'General', sortOrder: 4 },
  ],
  rulesLabel: 'Wellness Guidelines',
  rulesDescription: 'Habits for physical and mental health',
}

// ── Registry ───────────────────────────────────────────────────────

export const LAYER_HUB_CONFIGS: Record<string, LayerHubConfig> = {
  relish: RELISH_CONFIG,
  organization: ORGANIZATION_CONFIG,
  work: WORK_CONFIG,
  wellness: WELLNESS_CONFIG,
}

export function getLayerConfig(slug: string): LayerHubConfig | null {
  return LAYER_HUB_CONFIGS[slug] ?? null
}

// ── Cross-layer aggregation helpers ───────────────────────────────

export interface CoachingSection {
  slug: string
  name: string
  tagline: string
  color: string
  bgColor: string
  borderColor: string
  accentColor: string
  domains: LayerDomainConfig[]
  ruleCategories: LayerRuleCategoryConfig[]
  rulesLabel: string
}

export interface AnnotatedDomain extends LayerDomainConfig {
  layerSlug: string
  layerColor: string
  layerBgColor: string
  layerBorderColor: string
}

export interface AnnotatedRuleCategory extends LayerRuleCategoryConfig {
  layerSlug: string
  layerLabel: string
}

/** All 4 layer configs as sections (ordered: relish, work, organization, wellness) */
export function getAllCoachingSections(): CoachingSection[] {
  return ['relish', 'work', 'organization', 'wellness']
    .map(slug => LAYER_HUB_CONFIGS[slug])
    .filter(Boolean) as CoachingSection[]
}

/** Flat list of all domains annotated with layer info */
export function getAllDomains(): AnnotatedDomain[] {
  const sections = getAllCoachingSections()
  const result: AnnotatedDomain[] = []
  for (const s of sections) {
    for (const d of s.domains) {
      result.push({
        ...d,
        layerSlug: s.slug,
        layerColor: s.color,
        layerBgColor: s.bgColor,
        layerBorderColor: s.borderColor,
      })
    }
  }
  return result
}

/** Flat list of all rule categories annotated with layer info */
export function getAllRuleCategories(): AnnotatedRuleCategory[] {
  const sections = getAllCoachingSections()
  const result: AnnotatedRuleCategory[] = []
  for (const s of sections) {
    for (const c of s.ruleCategories) {
      result.push({ ...c, layerSlug: s.slug, layerLabel: s.name })
    }
  }
  return result
}

// ── Score helpers ──────────────────────────────────────────────────

export function ratingToScore(rating: number): number {
  // 1→20, 2→40, 3→60, 4→80, 5→100
  return rating * 20
}

export function scoreToColor(score: number | null): {
  text: string
  bg: string
  border: string
  label: string
} {
  if (score === null) return { text: 'text-neutral-400', bg: 'bg-neutral-100', border: 'border-neutral-200', label: '--' }
  if (score >= 75) return { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', label: 'Strong' }
  if (score >= 40) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Growing' }
  return { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'Needs attention' }
}
