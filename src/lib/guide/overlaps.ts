// Planning the year, step 6 (spec 2026-11-01): refine the list. Goals that
// may say the same thing, shown as pairs for Scott to decide on; nothing here
// merges or changes anything.
//
// Two goals overlap when their titles share two meaningful words (lowercased,
// stop words out), when one title holds the other, or when the words they
// share are at least half of the shorter title's: two short titles that
// share their one real word ("Run a 10k", "Run a half marathon") are worth a
// second look, two long ones that share one word are not.

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto', 'up', 'down', 'out', 'off', 'over', 'about', 'along', 'around', 'through',
  'is', 'are', 'be', 'been', 'being', 'am', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had', 'get', 'got', 'make', 'go', 'take',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'it', 'its', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her',
  'this', 'that', 'these', 'those', 'some', 'any', 'all', 'each', 'every', 'more', 'most', 'less', 'much', 'many', 'few', 'very', 'really', 'just', 'also', 'again',
  'not', 'no', 'than', 'then', 'as', 'if', 'when', 'what', 'which', 'who', 'how', 'year',
])

/** The title's words that carry meaning, lowercased, once each, in order. */
export function meaningfulWords(title: string): string[] {
  const words = title.toLowerCase().split(/[^\p{L}\p{N}']+/u).map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w && !STOP.has(w))
  return [...new Set(words)]
}

const normal = (title: string) => ` ${title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `

function overlap(a: { title: string }, b: { title: string }): boolean {
  const wa = meaningfulWords(a.title), wb = meaningfulWords(b.title)
  if (!wa.length || !wb.length) return false
  const na = normal(a.title), nb = normal(b.title)
  if (na.includes(nb) || nb.includes(na)) return true
  const inB = new Set(wb)
  const shared = wa.filter((w) => inB.has(w)).length
  return shared >= 2 || (shared >= 1 && shared * 2 >= Math.min(wa.length, wb.length))
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
