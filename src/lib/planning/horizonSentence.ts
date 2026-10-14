// src/lib/planning/horizonSentence.ts
//
// The one sentence under a Month, Season or Year heading (spec 2026-10-14,
// "The pages"): what the list holds, said back from rules — never written by
// a model. "11 open, 5 done. Four serve a Fall goal." An empty list says
// nothing.

export interface HorizonSentenceInput {
  /** Every item on the list on screen. */
  items: readonly { done: boolean; hasParent: boolean }[]
  /** The list one horizon up, by name ("Fall", "2026"); none for a year. */
  parentWord?: string | null
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
/** "Four" at the start of a sentence; past ten, the number. */
const lead = (n: number) => (n < WORDS.length ? WORDS[n] : String(n))
/** "an October goal", "a Fall goal". */
const aOrAn = (word: string) => (/^[aeiou8]/i.test(word) ? 'an' : 'a')

export function horizonSentence({ items, parentWord }: HorizonSentenceInput): string {
  if (items.length === 0) return ''
  const open = items.filter((i) => !i.done)
  const done = items.length - open.length
  const counts = [open.length ? `${open.length} open` : '', done ? `${done} done` : ''].filter(Boolean).join(', ')
  const parts = [`${counts}.`]
  // Of what is still open, how many serve something one horizon up.
  const serving = parentWord ? open.filter((i) => i.hasParent).length : 0
  if (serving > 0 && parentWord) {
    const goal = `${aOrAn(parentWord)} ${parentWord} goal`
    if (open.length === 1) parts.push(`It serves ${goal}.`)
    else if (serving === open.length) parts.push(`${open.length === 2 ? 'Both' : 'All'} serve ${goal}.`)
    else parts.push(`${lead(serving)} ${serving === 1 ? 'serves' : 'serve'} ${goal}.`)
  }
  return parts.join(' ')
}
