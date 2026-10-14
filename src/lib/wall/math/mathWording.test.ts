import { describe, expect, it } from 'vitest'
import type { MathSpec } from './mathProblem'
import { acceptWording, plainWording, shownWording, storyRequest } from './mathWording'

const DIV: MathSpec = { kind: 'divide', dividend: 742, divisor: 6, remainders: true }
const FRAC: MathSpec = { kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 3, d: 8 } }
const BIG: MathSpec = { kind: 'multiply', a: 432, b: 37 }

const story = 'The bakery made 742 cookies for Ella’s school fair. They pack them in boxes of 6. How many full boxes can they fill, and how many are left over?'

describe('acceptWording', () => {
  it('takes a story that keeps the numbers and hides the answer', () => {
    expect(acceptWording({ story, hint: 'How many 6s fit in 7?', labels: ['Full boxes', 'Left over'] }, DIV))
      .toEqual({ story, hint: 'How many 6s fit in 7?', labels: ['Full boxes', 'Left over'] })
  })
  it('refuses a story that drops a number', () => {
    expect(acceptWording({ story: story.replace('742', 'lots of'), labels: [] }, DIV)).toBeNull()
  })
  it('refuses a story that changes a number', () => {
    expect(acceptWording({ story: story.replace('742', '7420'), labels: [] }, DIV)).toBeNull()
  })
  it('refuses a story that gives the answer away', () => {
    expect(acceptWording({ story: `${story} (It’s 123 boxes!)`, labels: [] }, DIV)).toBeNull()
  })
  it('drops a hint that gives the answer away, keeps the story', () => {
    expect(acceptWording({ story, hint: 'It comes to 123.', labels: [] }, DIV)?.hint).toBeNull()
  })
  it('reads thousands commas', () => {
    expect(acceptWording({ story: 'Ella’s team sold 432 boxes of 37 pencils each. How many pencils in all?', labels: ['Pencils'] }, BIG)).not.toBeNull()
    const big: MathSpec = { kind: 'addsub', op: '+', a: 12345, b: 23456 }
    expect(acceptWording({ story: 'A stadium had 12,345 fans on Saturday and 23,456 on Sunday. How many in all?', labels: ['Fans'] }, big)).not.toBeNull()
  })
  it('needs fractions written as fractions', () => {
    expect(acceptWording({ story: 'Kaleb ate 1/4 of a pizza and then 3/8 more. How much did he eat?', labels: [] }, FRAC)).not.toBeNull()
    expect(acceptWording({ story: 'Kaleb ate a quarter of a pizza and then three eighths more. How much?', labels: [] }, FRAC)).toBeNull()
    expect(acceptWording({ story: 'Kaleb ate 1/4 of a pizza and then 3/8 more, which is 5/8.', labels: [] }, FRAC)).toBeNull()
  })
  it('keeps labels only when there is one per box', () => {
    expect(acceptWording({ story, labels: ['Full boxes'] }, DIV)?.labels).toEqual([])
    expect(acceptWording({ story, labels: ['A label that is far too long', 'x'] }, DIV)?.labels).toEqual([])
  })
  it('refuses junk', () => {
    expect(acceptWording(null, DIV)).toBeNull()
    expect(acceptWording({ story: 'short' }, DIV)).toBeNull()
  })
})

describe('shownWording', () => {
  it('falls back to the plain problem, the built-in hint and default boxes', () => {
    const w = shownWording(DIV, null, 'Ella')
    expect(w.story).toBe('Work out 742 ÷ 6. Put what’s left over in the R box.')
    expect(w.hint).toContain('How many 6s fit in 7?')
    expect(w.labels).toEqual(['Answer', 'Remainder'])
  })
  it('a plain word problem still tells a story', () => {
    expect(plainWording({ kind: 'word', a: 12, op1: '×', b: 4, op2: '+', c: 15 }, 'Kaleb').story)
      .toBe('Kaleb has 12 bags with 4 marbles in each, then finds 15 more marbles. How many marbles are there now?')
  })
})

describe('storyRequest', () => {
  it('sends the numbers, the answer and the steps', () => {
    expect(storyRequest({ kind: 'word', a: 12, op1: '×', b: 4, op2: '+', c: 15 }, 2, 'Kaleb')).toMatchObject({
      kidName: 'Kaleb', numbers: ['12', '4', '15'], answer: '63', answerShape: 'number', labelCount: 1,
      steps: ['12 × 4 = 48', '48 + 15 = 63'],
    })
    expect(storyRequest(DIV, 3, 'Ella')).toMatchObject({ expression: '742 ÷ 6', answer: '123 R4', labelCount: 2, levelLabel: '3-digit ÷ 1-digit, remainders' })
  })
})
