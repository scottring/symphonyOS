/**
 * Six-color palette used for family-member avatars across meal-card surfaces.
 * The same color name maps to the same hue everywhere, keeping the visual
 * identity consistent across EveningMealCard, TodayMealCard, and future
 * meal-related cards.
 */
export type AvatarColorName = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'

const BASE: Record<AvatarColorName, string> = {
  blue:   'hsl(217 91% 60%)',
  purple: 'hsl(271 81% 56%)',
  green:  'hsl(142 71% 45%)',
  orange: 'hsl(25 95% 53%)',
  pink:   'hsl(330 81% 60%)',
  teal:   'hsl(168 76% 42%)',
}

const FOREGROUND: Record<AvatarColorName, string> = {
  blue:   'hsl(217 91% 40%)',
  purple: 'hsl(271 81% 36%)',
  green:  'hsl(142 71% 30%)',
  orange: 'hsl(25 95% 38%)',
  pink:   'hsl(330 81% 40%)',
  teal:   'hsl(168 76% 28%)',
}

/** Background tint for an avatar bubble (faded version of the base hue). */
export function avatarBg(color: AvatarColorName): string {
  return `color-mix(in srgb, ${BASE[color]} 18%, white)`
}

/** Readable foreground for initials on the avatar background. */
export function avatarFg(color: AvatarColorName): string {
  return FOREGROUND[color]
}

/**
 * Legacy single-color helper kept for EveningMealCard's existing API
 * (`dinerColor(name, alpha)`). New code should prefer `avatarBg`/`avatarFg`.
 */
export function dinerColor(name: string, alpha: number): string {
  const base = (BASE as Record<string, string>)[name] ?? 'hsl(168 45% 30%)'
  if (alpha >= 1) return base
  return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, white)`
}
