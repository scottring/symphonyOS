// src/components/plan/planStatusParity.test.tsx
//
// The list and the reference rails must say the SAME thing about the same
// task. They drifted once: the month list started reading a placed-and-done
// row as finished while the rail still read only the row's own completion, so
// /month and /week disagreed about whether the porch was painted (review
// 2026-09-13, Codex finding 3).
//
// This is the tripwire. Every surface that draws a plan row derives
// finished-ness from rowIsDone and nothing else.

import { describe, it, expect } from 'vitest'
import { rowIsDone, rowOwnsCompletion } from './PlanRow'
import type { PlacementFate } from '@/lib/planning/lineage'

const FATES: PlacementFate[] = ['open', 'placed-open', 'placed-done', 'done']

describe('plan row status parity', () => {
  it('finished means own completion OR the copy\'s — never one surface\'s idea of it', () => {
    expect(FATES.filter(rowIsDone)).toEqual(['placed-done', 'done'])
  })

  it('an open row and a placed-but-open row are both unfinished', () => {
    expect(rowIsDone('open')).toBe(false)
    expect(rowIsDone('placed-open')).toBe(false)
  })

  it('reads as finished is NOT the same question as may be reopened here', () => {
    // The distinction that matters: a placed-done row looks finished and is
    // reopened elsewhere. Collapsing the two locked every completed row.
    expect(rowIsDone('placed-done')).toBe(true)
    expect(rowOwnsCompletion('placed-done')).toBe(false)
    expect(rowIsDone('done')).toBe(true)
    expect(rowOwnsCompletion('done')).toBe(true)
  })

  it('no renderer re-derives it inline — rowIsDone is the only definition', async () => {
    // A literal fate comparison inside a row renderer is how the drift
    // happened. Each component must ask the helper instead; rowIsDone's own
    // body is of course where the comparison belongs.
    const cases = [
      { mod: './PlanRow.tsx?raw', from: 'export function PlanRow(' },
      { mod: './PlanRail.tsx?raw', from: 'export function PlanRail(' },
    ] as const
    for (const { mod, from } of cases) {
      const src = (await import(/* @vite-ignore */ mod)).default as string
      const at = src.indexOf(from)
      expect(at).toBeGreaterThan(-1)
      expect(src.slice(at)).not.toMatch(/fate === '(placed-)?done'/)
    }
  })
})
