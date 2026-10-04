// Scale a recipe's ingredient line ×2 / ×3 on the wall (Scott, 2026-10-04:
// the wall showed the base soba recipe while the plan called for it tripled).
// Only the leading amount is touched — "1 1/4 lb salmon", "½ cup", "2–3 tbsp" —
// so "Salt and pepper" and "Cilantro" read as they were.

const VULGAR: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

// A whole number, a fraction, a mixed number, or a unicode fraction,
// optionally glued to a whole number ("1¼").
const AMOUNT = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?[¼½¾⅓⅔⅛]?|[¼½¾⅓⅔⅛])`
const LEADING = new RegExp(String.raw`^${AMOUNT}(?:\s*[–-]\s*${AMOUNT})?`)

function parse(s: string): number {
  const t = s.trim()
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const glued = t.match(/^(\d+(?:\.\d+)?)?([¼½¾⅓⅔⅛])$/)
  if (glued) return Number(glued[1] ?? 0) + VULGAR[glued[2]]
  return Number(t)
}

/** 2.5 → "2 1/2", 0.333 → "1/3", 3 → "3". Nearest quarter or third. */
function format(n: number): string {
  const whole = Math.floor(n + 1e-9)
  const rest = n - whole
  const options: [number, string][] = [[0, ''], [0.25, '1/4'], [1 / 3, '1/3'], [0.5, '1/2'], [2 / 3, '2/3'], [0.75, '3/4'], [1, '']]
  let best = options[0]
  for (const o of options) if (Math.abs(o[0] - rest) < Math.abs(best[0] - rest)) best = o
  const w = best[0] === 1 ? whole + 1 : whole
  if (!best[1]) return String(w)
  return w ? `${w} ${best[1]}` : best[1]
}

export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line
  const m = line.match(LEADING)
  if (!m) return line
  const [whole, a, b] = m
  const sep = whole.match(/\s*[–-]\s*/)?.[0].trim()
  const scaled = b ? `${format(parse(a) * factor)}${sep ?? '–'}${format(parse(b) * factor)}` : format(parse(a) * factor)
  return scaled + line.slice(whole.length)
}
