import { describe, it, expect } from 'vitest'
import { findTend } from './tendHeuristics'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null, raw_input: null,
    show_on_timeline: true, context: 'family',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('findTend lookalikes', () => {
  it('groups the plant-watering trio (substring token match)', () => {
    const findings = findTend([
      mk('Water plants', { id: 'a' }),
      mk('Water houseplants every Sunday', { id: 'b' }),
      mk('Water the plans every week', { id: 'c' }),
      mk('Walk Jax', { id: 'd' }),
    ])
    const look = findings.filter(f => f.kind === 'lookalike')
    expect(look).toHaveLength(1)
    expect(look[0].kind === 'lookalike' && look[0].ids.sort()).toEqual(['a', 'b', 'c'])
  })

  it('pairs dog feed/water overlap but not single-token overlap', () => {
    const findings = findTend([
      mk('Feed and water the dog', { id: 'a' }),
      mk("Fill the dog's water bowl", { id: 'b' }),
      mk('Walk the dog', { id: 'c' }),
    ])
    const look = findings.filter(f => f.kind === 'lookalike')
    expect(look).toHaveLength(1)
    expect(look[0].kind === 'lookalike' && look[0].ids.sort()).toEqual(['a', 'b'])
  })

  it('does not flag ordinary distinct routines', () => {
    const findings = findTend([mk('Walk Jax'), mk('Food shopping'), mk('PT Exercises')])
    expect(findings.filter(f => f.kind === 'lookalike')).toHaveLength(0)
  })

  it('does not match short tokens by substring (am vs camp)', () => {
    const findings = findTend([
      mk('School AM Routine', { id: 'a' }),
      mk('After camp routine', { id: 'b' }),
    ])
    expect(findings.filter(f => f.kind === 'lookalike')).toHaveLength(0)
  })
})

describe('findTend missing domain', () => {
  it('collects null-context active top-level routines into one finding', () => {
    const findings = findTend([
      mk('laundry', { id: 'a', context: null }),
      mk('Water plants2', { id: 'b', context: null }),
      mk('Tagged', { context: 'family' }),
      mk('Paused untagged', { context: null, visibility: 'reference' }),
      mk('Step untagged', { context: null, parent_routine_id: 'x' }),
    ])
    const md = findings.find(f => f.kind === 'missing-domain')
    expect(md?.kind === 'missing-domain' && md.ids.sort()).toEqual(['a', 'b'])
  })
})

describe('findTend unfinished names', () => {
  it('flags names ending in a dangling word', () => {
    const findings = findTend([
      mk('Do kitchen Laundry in the', { id: 'a' }),
      mk('Kids clean rooms every', { id: 'b' }),
      mk('Family reading time every', { id: 'c' }),
      mk('Clean kitchen after dinner', { id: 'd' }),
    ])
    const unf = findings.filter(f => f.kind === 'unfinished-name')
    expect(unf.map(f => f.kind === 'unfinished-name' && f.id).sort()).toEqual(['a', 'b', 'c'])
  })
})
