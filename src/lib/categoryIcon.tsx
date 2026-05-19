import { Car, Home, Calendar, Activity, CheckSquare, type LucideIcon } from 'lucide-react'

export interface CategoryIcon {
  Icon: LucideIcon
  /** Tailwind tint applied to the rounded icon tile (bg + text). */
  tint: string
}

const MAP: Record<string, CategoryIcon> = {
  errand:   { Icon: Car,      tint: 'bg-orange-50 text-orange-500' },
  chore:    { Icon: Home,     tint: 'bg-sage-50 text-sage-600' },
  event:    { Icon: Calendar, tint: 'bg-blue-50 text-blue-500' },
  activity: { Icon: Activity, tint: 'bg-purple-50 text-purple-500' },
  task:     { Icon: CheckSquare, tint: 'bg-primary-50 text-primary-600' },
}

const FALLBACK: CategoryIcon = { Icon: CheckSquare, tint: 'bg-primary-50 text-primary-600' }

/** Resolve a task category to a lucide icon + tile tint. Never throws. */
export function categoryIcon(category: string | undefined): CategoryIcon {
  if (!category) return FALLBACK
  return MAP[category] ?? FALLBACK
}
