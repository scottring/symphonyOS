// Planning the year, step 6 (spec 2026-11-01): refine the list. Goals that
// may say the same thing, shown as pairs for Scott to decide on; nothing here
// merges or changes anything.
//
// Precision over recall (controller ruling, Task 18 fix round 1): a false
// pair costs a tap and some trust, a missed one only a reread. Two goals
// pair when their titles share two meaningful words (lowercased, stop words
// out), or when every meaningful word of one is in the other ("Get fit",
// "Get fit this year"). A number or amount ("10k", "$401k", "2027") never
// counts as shared: "Save $10k" and "Run a 10k" are different goals, and a
// title with one is never held by another. The same title twice is always a
// pair, numbers and all (lowercased, punctuation and spacing aside).

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto', 'up', 'down', 'out', 'off', 'over', 'about', 'along', 'around', 'through',
  'is', 'are', 'be', 'been', 'being', 'am', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had', 'get', 'got', 'make', 'go', 'take',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'it', 'its', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her',
  'this', 'that', 'these', 'those', 'some', 'any', 'all', 'each', 'every', 'more', 'most', 'less', 'much', 'many', 'few', 'very', 'really', 'just', 'also', 'again',
  'not', 'no', 'than', 'then', 'as', 'if', 'when', 'what', 'which', 'who', 'how', 'year', 'new',
])

/** The title's words that carry meaning, lowercased, once each, in order. */
export function meaningfulWords(title: string): string[] {
  const words = title.toLowerCase().split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w && !STOP.has(w))
  return [...new Set(words)]
}

/** A number or amount: in the title, never a match. */
const isNumber = (word: string) => /\d/.test(word)

/** The title as words: lowercased, punctuation and extra spaces gone. */
const normalTitle = (title: string) => title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')

function overlap(a: { title: string }, b: { title: string }): boolean {
  const na = normalTitle(a.title)
  if (na && na === normalTitle(b.title)) return true
  const wa = meaningfulWords(a.title), wb = meaningfulWords(b.title)
  if (!wa.length || !wb.length) return false
  const matches = (w: string, other: ReadonlySet<string>) => !isNumber(w) && other.has(w)
  const inA = new Set(wa), inB = new Set(wb)
  const shared = wa.filter((w) => matches(w, inB)).length
  return shared >= 2 || wa.every((w) => matches(w, inB)) || wb.every((w) => matches(w, inA))
}

/** Every pair of goals that may overlap, once, in list order: [earlier id, later id]. */
export function findOverlaps(goals: readonly { id: string; title: string }[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      if (overlap(goals[i], goals[j])) pairs.push([goals[i].id, goals[j].id])
    }
  }
  return pairs
}
