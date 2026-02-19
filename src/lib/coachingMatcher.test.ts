import { describe, it, expect } from 'vitest'
import { getCoachingForItem, hasCoachingForItem } from './coachingMatcher'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyRule } from '@/types/playbook'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal TimelineItem factory */
function makeItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'item-1',
    type: 'task',
    title: 'Test item',
    startTime: null,
    endTime: null,
    completed: false,
    ...overrides,
  }
}

/** Minimal active FamilyRule factory */
function makeRule(overrides: Partial<FamilyRule> = {}): FamilyRule {
  return {
    id: 'rule-1',
    userId: 'user-1',
    rule: 'Some rule text',
    appliesTo: [],
    category: null,
    layerId: null,
    status: 'active',
    rationale: null,
    enforcementTip: 'Tip text',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Build a Date for today at a given hour (and optional minutes) */
function todayAt(hour: number, minute = 0): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// getCoachingForItem
// ---------------------------------------------------------------------------

describe('getCoachingForItem', () => {
  // ── Early returns ──────────────────────────────────────────────────

  describe('early returns', () => {
    it('returns empty array when hideCoaching is true', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning' })]
      expect(getCoachingForItem(item, rules, true)).toEqual([])
    })

    it('returns empty array when rules array is empty', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      expect(getCoachingForItem(item, [], false)).toEqual([])
    })

    it('returns empty array when all rules are draft (no active rules)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ status: 'draft', category: 'morning' })]
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('returns empty array when item has no context', () => {
      const item = makeItem({ context: null, startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning' })]
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('returns empty array when item context is undefined', () => {
      const item = makeItem({ startTime: todayAt(7) })
      // context defaults to undefined (not in overrides)
      const rules = [makeRule({ category: 'morning' })]
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })
  })

  // ── Context-to-layer mapping ───────────────────────────────────────

  describe('context to layer mapping', () => {
    it('maps family context to relish layer', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].layerName).toBe('Relish')
      expect(result[0].layerColor).toBe('border-amber-200')
    })

    it('maps work context to work layer', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'focus-blocks' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].layerName).toBe('Work Focus')
      expect(result[0].layerColor).toBe('border-blue-200')
    })

    it('maps personal context to wellness layer', () => {
      const item = makeItem({ context: 'personal', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].layerName).toBe('Wellness')
      expect(result[0].layerColor).toBe('border-green-200')
    })
  })

  // ── Rule filtering ─────────────────────────────────────────────────

  describe('rule filtering', () => {
    it('excludes rules with no category', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: null })]
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('excludes rules whose category does not belong to the layer', () => {
      // 'focus-blocks' is a work category, not relish
      const item = makeItem({ context: 'family', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'focus-blocks' })]
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('excludes rules with neither enforcementTip nor rule text', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning', enforcementTip: null, rule: '' })]
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('includes rules with only enforcementTip (no rule text)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning', enforcementTip: 'Do this', rule: '' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
    })

    it('includes rules with only rule text (no enforcementTip)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning', enforcementTip: null, rule: 'A rule' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
    })

    it('filters out draft rules even when mixed with active rules', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [
        makeRule({ id: 'r1', category: 'morning', status: 'draft' }),
        makeRule({ id: 'r2', category: 'morning', status: 'active' }),
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].rule.id).toBe('r2')
    })

    it('filters out paused and retired rules', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [
        makeRule({ id: 'r1', category: 'morning', status: 'paused' as FamilyRule['status'] }),
        makeRule({ id: 'r2', category: 'morning', status: 'retired' as FamilyRule['status'] }),
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toEqual([])
    })
  })

  // ── Time-based category matching ───────────────────────────────────

  describe('time-based matching', () => {
    it('matches morning category as strong before 9am', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('strong')
    })

    it('matches morning category as related at noon (not time-relevant)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(12) })
      const rules = [makeRule({ category: 'morning' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('related')
    })

    it('hour < 9: only morning is time-relevant', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(6) })
      const morningRule = makeRule({ id: 'morning', category: 'morning' })
      const mealsRule = makeRule({ id: 'meals', category: 'meals' })
      const result = getCoachingForItem(item, [morningRule, mealsRule], false)
      const strong = result.filter(m => m.relevance === 'strong')
      const related = result.filter(m => m.relevance === 'related')
      expect(strong).toHaveLength(1)
      expect(strong[0].rule.id).toBe('morning')
      expect(related).toHaveLength(1)
      expect(related[0].rule.id).toBe('meals')
    })

    it('hour 9-11: focus-blocks, activities, homework are time-relevant', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(10) })
      const rules = [
        makeRule({ id: 'act', category: 'activities' }),
        makeRule({ id: 'hw', category: 'homework' }),
        makeRule({ id: 'bed', category: 'bedtime' }),
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result.filter(m => m.relevance === 'strong').map(m => m.rule.id).sort())
        .toEqual(['act', 'hw'])
      expect(result.find(m => m.rule.id === 'bed')?.relevance).toBe('related')
    })

    it('hour 9-11: focus-blocks is time-relevant for work context', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'focus-blocks' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('strong')
    })

    it('hour 12-16: meals, activities, meetings, focus-blocks are time-relevant', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(14) })
      const rules = [
        makeRule({ id: 'fb', category: 'focus-blocks' }),
        makeRule({ id: 'mtg', category: 'meetings' }),
        makeRule({ id: 'comm', category: 'communication' }),
      ]
      const result = getCoachingForItem(item, rules, false)
      // focus-blocks and meetings should be strong, communication should be related
      expect(result.find(m => m.rule.id === 'fb')?.relevance).toBe('strong')
      expect(result.find(m => m.rule.id === 'mtg')?.relevance).toBe('strong')
      expect(result.find(m => m.rule.id === 'comm')?.relevance).toBe('related')
    })

    it('hour 12-16: meals is time-relevant for family context', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(12, 30) })
      const rules = [makeRule({ category: 'meals' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('strong')
    })

    it('hour 17-19: meals, evening, activities, bedtime are time-relevant', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(18) })
      const rules = [
        makeRule({ id: 'meals', category: 'meals' }),
        makeRule({ id: 'bed', category: 'bedtime' }),
        makeRule({ id: 'act', category: 'activities' }),
        makeRule({ id: 'morn', category: 'morning' }),
      ]
      const result = getCoachingForItem(item, rules, false)
      // meals, bedtime, activities should be strong; morning should be related
      // But max 3, so morning may or may not appear
      const strong = result.filter(m => m.relevance === 'strong')
      expect(strong.length).toBeGreaterThanOrEqual(2)
      for (const m of strong) {
        expect(['meals', 'bed', 'act']).toContain(m.rule.id)
      }
    })

    it('hour 17-19: evening is time-relevant for wellness', () => {
      const item = makeItem({ context: 'personal', startTime: todayAt(19) })
      const rules = [makeRule({ category: 'evening' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('strong')
    })

    it('hour >= 20: bedtime and evening are time-relevant', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(21) })
      const rules = [
        makeRule({ id: 'bed', category: 'bedtime' }),
        makeRule({ id: 'morn', category: 'morning' }),
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result.find(m => m.rule.id === 'bed')?.relevance).toBe('strong')
      expect(result.find(m => m.rule.id === 'morn')?.relevance).toBe('related')
    })

    it('hour >= 20: evening is time-relevant for wellness', () => {
      const item = makeItem({ context: 'personal', startTime: todayAt(22) })
      const rules = [makeRule({ category: 'evening' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('strong')
    })

    it('null startTime means no time-relevant categories (all related)', () => {
      const item = makeItem({ context: 'family', startTime: null })
      const rules = [makeRule({ category: 'morning' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].relevance).toBe('related')
    })
  })

  // ── Sorting and limit ──────────────────────────────────────────────

  describe('sorting and limit', () => {
    it('sorts strong matches before related matches', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [
        makeRule({ id: 'meals', category: 'meals' }),       // not time-relevant at 7am
        makeRule({ id: 'morning', category: 'morning' }),   // time-relevant
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].relevance).toBe('strong')
      expect(result[0].rule.id).toBe('morning')
      expect(result[1].relevance).toBe('related')
      expect(result[1].rule.id).toBe('meals')
    })

    it('returns at most 3 results', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(18) })
      const rules = [
        makeRule({ id: 'r1', category: 'meals' }),
        makeRule({ id: 'r2', category: 'bedtime' }),
        makeRule({ id: 'r3', category: 'activities' }),
        makeRule({ id: 'r4', category: 'morning' }),
        makeRule({ id: 'r5', category: 'screens' }),
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result.length).toBeLessThanOrEqual(3)
    })

    it('strong matches are prioritized within the 3-item limit', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(18) })
      // At hour 18: meals, evening, activities, bedtime are time-relevant
      const rules = [
        makeRule({ id: 'morn', category: 'morning' }),     // related
        makeRule({ id: 'screen', category: 'screens' }),   // related
        makeRule({ id: 'meals', category: 'meals' }),      // strong
        makeRule({ id: 'bed', category: 'bedtime' }),      // strong
        makeRule({ id: 'act', category: 'activities' }),   // strong
      ]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(3)
      // All 3 should be strong since we have 3 strong matches available
      expect(result.every(m => m.relevance === 'strong')).toBe(true)
    })
  })

  // ── Category labels ────────────────────────────────────────────────

  describe('category labels', () => {
    it('resolves relish category label from config', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'morning' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].categoryLabel).toBe('Morning')
    })

    it('resolves work category label from config', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'focus-blocks' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].categoryLabel).toBe('Focus Blocks')
    })

    it('resolves wellness category label from config', () => {
      const item = makeItem({ context: 'personal', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'exercise' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result[0].categoryLabel).toBe('Exercise')
    })
  })

  // ── Cross-layer isolation ──────────────────────────────────────────

  describe('cross-layer isolation', () => {
    it('does not match work rules for a family-context item', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'meetings' })] // meetings is a work category
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('does not match family rules for a work-context item', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'bedtime' })] // bedtime is a relish category
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('does not match wellness rules for a work-context item', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'exercise' })] // exercise is a wellness category
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })

    it('does not match family rules for a personal-context item', () => {
      const item = makeItem({ context: 'personal', startTime: todayAt(7) })
      const rules = [makeRule({ category: 'screens' })] // screens is a relish category
      expect(getCoachingForItem(item, rules, false)).toEqual([])
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles exactly hour 9 boundary (9 is NOT < 9)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(9, 0) })
      // At hour 9 we are in the 9-11 window: focus-blocks, activities, homework
      const morningRule = makeRule({ id: 'morning', category: 'morning' })
      const actRule = makeRule({ id: 'act', category: 'activities' })
      const result = getCoachingForItem(item, [morningRule, actRule], false)
      expect(result.find(m => m.rule.id === 'morning')?.relevance).toBe('related')
      expect(result.find(m => m.rule.id === 'act')?.relevance).toBe('strong')
    })

    it('handles exactly hour 12 boundary', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(12, 0) })
      // hour 12: meals, activities, meetings, focus-blocks
      const mealsRule = makeRule({ category: 'meals' })
      const result = getCoachingForItem(item, [mealsRule], false)
      expect(result[0].relevance).toBe('strong')
    })

    it('handles exactly hour 17 boundary', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(17, 0) })
      // hour 17: meals, evening, activities, bedtime
      const bedRule = makeRule({ category: 'bedtime' })
      const result = getCoachingForItem(item, [bedRule], false)
      expect(result[0].relevance).toBe('strong')
    })

    it('handles exactly hour 20 boundary', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(20, 0) })
      // hour 20: bedtime, evening
      const bedRule = makeRule({ category: 'bedtime' })
      const result = getCoachingForItem(item, [bedRule], false)
      expect(result[0].relevance).toBe('strong')
    })

    it('handles midnight (hour 0) as morning time', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(0) })
      const morningRule = makeRule({ category: 'morning' })
      const result = getCoachingForItem(item, [morningRule], false)
      expect(result[0].relevance).toBe('strong')
    })

    it('returns the full rule object in the match', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(7) })
      const rule = makeRule({
        id: 'r-abc',
        rule: 'No screens before breakfast',
        category: 'morning',
        enforcementTip: 'Redirect to puzzle',
      })
      const result = getCoachingForItem(item, [rule], false)
      expect(result[0].rule).toBe(rule) // same reference
    })

    it('general category in relish is always related (never time-relevant)', () => {
      // 'general' does not appear in any time window
      const item = makeItem({ context: 'family', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'general' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].relevance).toBe('related')
    })

    it('general category in work is always related', () => {
      const item = makeItem({ context: 'work', startTime: todayAt(10) })
      const rules = [makeRule({ category: 'general' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].relevance).toBe('related')
    })

    it('behavior category in relish is always related (no time window)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(14) })
      const rules = [makeRule({ category: 'behavior' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].relevance).toBe('related')
    })

    it('screens category in relish is always related (no time window)', () => {
      const item = makeItem({ context: 'family', startTime: todayAt(14) })
      const rules = [makeRule({ category: 'screens' })]
      const result = getCoachingForItem(item, rules, false)
      expect(result).toHaveLength(1)
      expect(result[0].relevance).toBe('related')
    })
  })
})

// ---------------------------------------------------------------------------
// hasCoachingForItem
// ---------------------------------------------------------------------------

describe('hasCoachingForItem', () => {
  it('returns false when rules array is empty', () => {
    const item = makeItem({ context: 'family' })
    expect(hasCoachingForItem(item, [])).toBe(false)
  })

  it('returns false when item has no context', () => {
    const item = makeItem({ context: null })
    const rules = [makeRule({ category: 'morning' })]
    expect(hasCoachingForItem(item, rules)).toBe(false)
  })

  it('returns false when item context is undefined', () => {
    const item = makeItem()
    const rules = [makeRule({ category: 'morning' })]
    expect(hasCoachingForItem(item, rules)).toBe(false)
  })

  it('returns true for active rule with matching layer category and enforcementTip', () => {
    const item = makeItem({ context: 'family' })
    const rules = [makeRule({ category: 'morning', enforcementTip: 'Do it' })]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })

  it('returns true for active rule with matching category and rule text (no tip)', () => {
    const item = makeItem({ context: 'family' })
    const rules = [makeRule({ category: 'morning', enforcementTip: null, rule: 'Some rule' })]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })

  it('returns false when all rules are drafts', () => {
    const item = makeItem({ context: 'family' })
    const rules = [makeRule({ category: 'morning', status: 'draft' })]
    expect(hasCoachingForItem(item, rules)).toBe(false)
  })

  it('returns false when rule category does not belong to the layer', () => {
    const item = makeItem({ context: 'family' })
    // 'focus-blocks' belongs to work, not relish
    const rules = [makeRule({ category: 'focus-blocks' })]
    expect(hasCoachingForItem(item, rules)).toBe(false)
  })

  it('returns false when rules have no enforcementTip and no rule text', () => {
    const item = makeItem({ context: 'family' })
    const rules = [makeRule({ category: 'morning', enforcementTip: null, rule: '' })]
    expect(hasCoachingForItem(item, rules)).toBe(false)
  })

  it('returns true for work context with work category', () => {
    const item = makeItem({ context: 'work' })
    const rules = [makeRule({ category: 'meetings' })]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })

  it('returns true for personal context with wellness category', () => {
    const item = makeItem({ context: 'personal' })
    const rules = [makeRule({ category: 'exercise' })]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })

  it('returns true if at least one rule matches among many', () => {
    const item = makeItem({ context: 'family' })
    const rules = [
      makeRule({ id: 'r1', category: 'focus-blocks', status: 'active' }),  // wrong layer
      makeRule({ id: 'r2', category: 'morning', status: 'draft' }),         // draft
      makeRule({ id: 'r3', category: null }),                                // no category
      makeRule({ id: 'r4', category: 'bedtime', enforcementTip: null, rule: '' }), // no content
      makeRule({ id: 'r5', category: 'meals', enforcementTip: 'Serve veggies' }), // valid!
    ]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })

  it('does not depend on startTime (no time filtering)', () => {
    const item = makeItem({ context: 'family', startTime: null })
    const rules = [makeRule({ category: 'morning' })]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })

  it('does not depend on hideCoaching (not a parameter)', () => {
    // hasCoachingForItem has no hideCoaching parameter; it's a quick check
    const item = makeItem({ context: 'family' })
    const rules = [makeRule({ category: 'morning' })]
    expect(hasCoachingForItem(item, rules)).toBe(true)
  })
})
