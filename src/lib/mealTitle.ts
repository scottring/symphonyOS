const MEAL_PREFIXES = ['Dinner', 'Lunch', 'Breakfast', 'Snack']

/**
 * Parses a meal title into display parts.
 *
 *   "Dinner · Crispy tofu stir fry + brown rice + broccoli"
 *     → { title: "Crispy tofu stir fry", sides: "brown rice + broccoli" }
 *
 * Live meal data stores the entire string in one field; this is a UI-side split
 * so the card can render two rows (main + sides) without changing data shape.
 */
export function parseMealTitle(raw: string): { title: string; sides?: string } {
  let s = raw.trim()
  for (const p of MEAL_PREFIXES) {
    if (s.startsWith(`${p} · `)) {
      s = s.slice(p.length + 3) // strip "Dinner · "
      break
    }
  }
  const idx = s.indexOf(' + ')
  if (idx === -1) return { title: s, sides: undefined }
  return { title: s.slice(0, idx), sides: s.slice(idx + 3) }
}
