// The words around a Math of the day problem. Claude writes a short story
// for the numbers and a kid-sized hint (edge function `math-story`); this
// file decides whether what came back can be used, and what the wall says
// when it can't (or Claude is slow or down): the plain problem, with a
// built-in story only for word problems, which need one.
//
// The numbers always come from code. A story is accepted only if it keeps
// every number of the problem and never states the answer.
//
// PURE.

import { answerOf, answerText, operandsOf, problemText, LEVEL_LABEL, type MathAnswer, type MathSpec } from './mathProblem'
import { defaultHint } from './mathWorked'
import type { MathWording } from './mathProgress'

/** Long enough for three short sentences; longer won't fit beside the pad. */
export const STORY_MAX = 240
export const HINT_MAX = 220
export const LABEL_MAX = 18

export type AnswerShape = MathAnswer['type']

export function defaultLabels(shape: AnswerShape): string[] {
  if (shape === 'remainder') return ['Answer', 'Remainder']
  if (shape === 'number') return ['Answer']
  return []
}

export function labelCount(shape: AnswerShape): number {
  return shape === 'remainder' ? 2 : shape === 'number' ? 1 : 0
}

function plainStory(spec: MathSpec, name: string): string {
  switch (spec.kind) {
    case 'divide':
      return spec.remainders
        ? `Work out ${problemText(spec)}. Put what’s left over in the R box.`
        : `Work out ${problemText(spec)}.`
    // The fractions themselves are drawn large under the story.
    case 'fraction':
      return spec.form === 'of'
        ? 'How much is this fraction of the number?'
        : `${spec.form === 'add' ? 'Add' : 'Subtract'} the fractions, and write the answer as a fraction.`
    case 'word': {
      const { a, b, c } = spec
      if (spec.op1 === '×' && spec.op2 === '+') return `${name} has ${a} bags with ${b} marbles in each, then finds ${c} more marbles. How many marbles are there now?`
      if (spec.op1 === '×') return `${name} sets out ${a} rows of ${b} chairs. Then ${c} chairs are taken away. How many chairs are left?`
      if (spec.op2 === '+') return `${a} stickers are shared equally among ${b} friends. Then ${name} gives one friend ${c} more. How many stickers does that friend have now?`
      return `${a} stickers are shared equally among ${b} friends. Then one friend gives away ${c}. How many does that friend have left?`
    }
    default:
      return `Work out ${problemText(spec)}.`
  }
}

/** What the wall says before Claude's story arrives, or instead of it. */
export function plainWording(spec: MathSpec, kidName: string): MathWording {
  return { story: plainStory(spec, kidName), hint: null, labels: [] }
}

/** Digits with thousands commas joined back up ("1,296" → "1296"). */
function normalizeNumbers(text: string): string {
  return text.replace(/(\d),(?=\d{3}\b)/g, '$1')
}

function mentions(text: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`(^|[^\\d/])${esc}(?![\\d/])`).test(text)
}

/** The answer as it could be given away in words ("123", "5/8"). Null when it
 *  is also one of the problem's own numbers, so it can't be checked for. */
function giveaway(spec: MathSpec): string | null {
  const a = answerOf(spec)
  const token = a.type === 'number' ? String(a.value) : a.type === 'remainder' ? String(a.quotient) : `${a.n}/${a.d}`
  return operandsOf(spec).includes(token) ? null : token
}

/** Claude's wording if it is usable for this problem, else null. */
export function acceptWording(raw: unknown, spec: MathSpec): MathWording | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.story !== 'string') return null
  const story = r.story.trim().replace(/\s+/g, ' ')
  if (story.length < 20 || story.length > STORY_MAX) return null
  const flat = normalizeNumbers(story)
  if (!operandsOf(spec).every((n) => mentions(flat, n))) return null
  const secret = giveaway(spec)
  if (secret && mentions(flat, secret)) return null

  let hint: string | null = null
  if (typeof r.hint === 'string') {
    const h = r.hint.trim().replace(/\s+/g, ' ')
    if (h.length > 0 && h.length <= HINT_MAX && !(secret && mentions(normalizeNumbers(h), secret))) hint = h
  }

  const shape = answerOf(spec).type
  let labels: string[] = []
  if (Array.isArray(r.labels)) {
    const ls = r.labels.filter((l): l is string => typeof l === 'string').map((l) => l.trim())
    if (ls.length === labelCount(shape) && ls.every((l) => l.length > 0 && l.length <= LABEL_MAX)) labels = ls
  }
  return { story, hint, labels }
}

/** What the wall shows: the stored wording if any, else the plain one; the
 *  hint and labels fall back to the built-in ones. */
export function shownWording(spec: MathSpec, wording: MathWording | null, kidName: string): Required<MathWording> & { hint: string } {
  const plain = plainWording(spec, kidName)
  const shape = answerOf(spec).type
  return {
    story: wording?.story ?? plain.story,
    hint: wording?.hint ?? defaultHint(spec),
    labels: wording?.labels.length === labelCount(shape) && labelCount(shape) > 0 ? wording.labels : defaultLabels(shape),
  }
}

/** What the wall sends to `math-story`: the numbers and the answer, never a choice. */
export interface StoryRequest {
  kidName: string
  kind: MathSpec['kind']
  levelLabel: string
  expression: string
  numbers: string[]
  answer: string
  answerShape: AnswerShape
  labelCount: number
  /** Word problems: the two steps the story must need, in order. */
  steps: string[] | null
  defaultHint: string
}

export function storyRequest(spec: MathSpec, level: number, kidName: string): StoryRequest {
  const answer = answerOf(spec)
  let steps: string[] | null = null
  if (spec.kind === 'word') {
    const first = spec.op1 === '×' ? spec.a * spec.b : spec.a / spec.b
    steps = [
      `${spec.a} ${spec.op1} ${spec.b} = ${first}`,
      `${first} ${spec.op2 === '+' ? '+' : '−'} ${spec.c} = ${answerText(answer)}`,
    ]
  }
  return {
    kidName,
    kind: spec.kind,
    levelLabel: LEVEL_LABEL[spec.kind][level - 1] ?? '',
    expression: problemText(spec),
    numbers: operandsOf(spec),
    answer: answerText(answer),
    answerShape: answer.type,
    labelCount: labelCount(answer.type),
    steps,
    defaultHint: defaultHint(spec),
  }
}
