// Deno test — run with: deno test supabase/functions/note-match/index_test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildPrompt, parseResponse } from './index.ts'

Deno.test('buildPrompt embeds task and candidates', () => {
  const prompt = buildPrompt({
    inbox_item: { title: 'Look into bike storage', notes: 'For the garage' },
    candidate_notes: [
      { id: 'n1', title: 'Backyard reno', first_200_chars: 'Front yard ideas + budget' },
      { id: 'n2', title: 'Vendors', first_200_chars: 'Plumber, electrician, etc.' },
    ],
    domain: 'family',
  })
  assert(prompt.includes('Look into bike storage'))
  assert(prompt.includes('For the garage'))
  assert(prompt.includes('Backyard reno'))
  assert(prompt.includes('n1'))
  assert(prompt.includes('family'))
})

Deno.test('parseResponse extracts best_match and suggested_new_title from valid JSON', () => {
  const out = parseResponse('{"best_match":{"id":"n1","confidence":0.82},"suggested_new_title":"Bike storage ideas"}')
  assertEquals(out.best_match?.id, 'n1')
  assertEquals(out.best_match?.confidence, 0.82)
  assertEquals(out.suggested_new_title, 'Bike storage ideas')
})

Deno.test('parseResponse falls back when JSON is malformed', () => {
  const out = parseResponse('not json at all')
  assertEquals(out.best_match, null)
  assertEquals(typeof out.suggested_new_title, 'string')
})

Deno.test('parseResponse falls back when fields are missing', () => {
  const out = parseResponse('{"unrelated":true}')
  assertEquals(out.best_match, null)
})

Deno.test('parseResponse strips JSON from code-fenced response', () => {
  const fenced = '```json\n{"best_match":null,"suggested_new_title":"X"}\n```'
  const out = parseResponse(fenced)
  assertEquals(out.best_match, null)
  assertEquals(out.suggested_new_title, 'X')
})
