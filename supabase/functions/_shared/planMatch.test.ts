import { describe, it, expect, vi } from 'vitest'
import {
  validateMatches,
  buildMatchPrompt,
  matchPlanItems,
  type MatchCandidate,
} from './planMatch.ts'

const CANDIDATES: MatchCandidate[] = [
  { id: 't-roof', title: 'Call the roofer' },
  { id: 't-bank', title: 'Call bank re: the wire transfer' },
]
const IDS = new Set(CANDIDATES.map((c) => c.id))

describe('validateMatches', () => {
  it('keeps a well-formed match', () => {
    expect(validateMatches({ matches: [{ index: 0, task_id: 't-roof' }] }, IDS, 2))
      .toEqual([{ index: 0, taskId: 't-roof' }])
  })

  it('drops an id that was never sent as a candidate', () => {
    // The hallucination guard: a model-invented id must never reach a write.
    expect(validateMatches({ matches: [{ index: 0, task_id: 't-invented' }] }, IDS, 2)).toEqual([])
  })

  it('drops an index outside the parsed item range', () => {
    expect(validateMatches({ matches: [{ index: 9, task_id: 't-roof' }] }, IDS, 2)).toEqual([])
    expect(validateMatches({ matches: [{ index: -1, task_id: 't-roof' }] }, IDS, 2)).toEqual([])
  })

  it('keeps only the first match for a repeated index', () => {
    const out = validateMatches(
      { matches: [{ index: 0, task_id: 't-roof' }, { index: 0, task_id: 't-bank' }] },
      IDS,
      2,
    )
    expect(out).toEqual([{ index: 0, taskId: 't-roof' }])
  })

  it('tolerates a malformed response instead of throwing', () => {
    expect(validateMatches(null, IDS, 2)).toEqual([])
    expect(validateMatches({ matches: 'nope' }, IDS, 2)).toEqual([])
    expect(validateMatches({}, IDS, 2)).toEqual([])
    expect(validateMatches({ matches: [{ index: 'x', task_id: 't-roof' }] }, IDS, 2)).toEqual([])
  })
})

describe('buildMatchPrompt', () => {
  it('lists every candidate id and every parsed title', () => {
    const prompt = buildMatchPrompt(['Call roofer'], CANDIDATES)
    expect(prompt).toContain('t-roof')
    expect(prompt).toContain('Call the roofer')
    expect(prompt).toContain('0: Call roofer')
  })

  it('states the same-action bar so a different action on the same subject is excluded', () => {
    const prompt = buildMatchPrompt(['x'], CANDIDATES)
    expect(prompt).toContain('same action')
  })
})

describe('matchPlanItems', () => {
  it('short-circuits with no candidates and never calls the model', async () => {
    const call = vi.fn()
    expect(await matchPlanItems(['Call roofer'], [], call)).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it('short-circuits with no items and never calls the model', async () => {
    const call = vi.fn()
    expect(await matchPlanItems([], CANDIDATES, call)).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })

  it('validates whatever the model returns', async () => {
    const call = vi.fn().mockResolvedValue('{"matches":[{"index":0,"task_id":"t-roof"}]}')
    expect(await matchPlanItems(['Call roofer'], CANDIDATES, call))
      .toEqual([{ index: 0, taskId: 't-roof' }])
  })

  it('strips markdown fences the model may wrap the JSON in', async () => {
    const call = vi.fn().mockResolvedValue('```json\n{"matches":[{"index":0,"task_id":"t-bank"}]}\n```')
    expect(await matchPlanItems(['bank'], CANDIDATES, call))
      .toEqual([{ index: 0, taskId: 't-bank' }])
  })

  it('returns no matches when the model call rejects', async () => {
    // Fails soft: a matcher problem must never take down a parse that succeeded.
    const call = vi.fn().mockRejectedValue(new Error('529 overloaded'))
    expect(await matchPlanItems(['Call roofer'], CANDIDATES, call)).toEqual([])
  })

  it('returns no matches when the model returns unparseable text', async () => {
    const call = vi.fn().mockResolvedValue('I could not determine any matches.')
    expect(await matchPlanItems(['Call roofer'], CANDIDATES, call)).toEqual([])
  })
})
