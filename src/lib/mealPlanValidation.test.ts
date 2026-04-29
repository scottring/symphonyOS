import { describe, it, expect } from 'vitest'
import { validateGeneratedEntries, buildPromptContext } from './mealPlanValidation'

const ROSTER = new Set(['fm-iris', 'fm-scott', 'fm-ella'])
const SHELF = new Set(['rec-shrimp', 'rec-cauliflower'])

describe('validateGeneratedEntries', () => {
  it('keeps a fully valid family-default entry', () => {
    const { kept, dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'dinner',
          family_member_id: null,
          recipe_id: 'rec-shrimp',
          ad_hoc_title: null,
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })

  it('keeps a per-person entry', () => {
    const { kept } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'breakfast',
          family_member_id: 'fm-iris',
          recipe_id: null,
          ad_hoc_title: 'Yogurt',
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(kept).toHaveLength(1)
  })

  it('drops entry with day_of_week out of range', () => {
    const { kept, dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 7,
          slot: 'dinner',
          family_member_id: null,
          recipe_id: 'rec-shrimp',
          ad_hoc_title: null,
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(kept).toHaveLength(0)
    expect(dropped[0].reason).toMatch(/day_of_week/)
  })

  it('drops entry with non-canonical slot', () => {
    const { dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'brunch' as never,
          family_member_id: null,
          recipe_id: 'rec-shrimp',
          ad_hoc_title: null,
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(dropped[0].reason).toMatch(/slot/)
  })

  it('drops entry with unknown family_member_id', () => {
    const { dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'dinner',
          family_member_id: 'fm-ghost',
          recipe_id: 'rec-shrimp',
          ad_hoc_title: null,
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(dropped[0].reason).toMatch(/family_member_id/)
  })

  it('drops entry with unknown recipe_id', () => {
    const { dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'dinner',
          family_member_id: null,
          recipe_id: 'rec-ghost',
          ad_hoc_title: null,
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(dropped[0].reason).toMatch(/recipe_id/)
  })

  it('drops entry with both recipe_id and ad_hoc_title set', () => {
    const { dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'dinner',
          family_member_id: null,
          recipe_id: 'rec-shrimp',
          ad_hoc_title: 'Other',
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(dropped[0].reason).toMatch(/exactly one/i)
  })

  it('drops entry with neither recipe_id nor ad_hoc_title set', () => {
    const { dropped } = validateGeneratedEntries(
      [
        {
          day_of_week: 0,
          slot: 'dinner',
          family_member_id: null,
          recipe_id: null,
          ad_hoc_title: null,
        },
      ],
      ROSTER,
      SHELF,
    )
    expect(dropped[0].reason).toMatch(/exactly one/i)
  })
})

describe('buildPromptContext', () => {
  it('emits week, roster, shelf, habits, and brief sections', () => {
    const out = buildPromptContext({
      weekStart: '2026-04-27',
      mealPlanId: 'mp-1',
      members: [
        { name: 'Iris', family_member_id: 'fm-iris', auth_user_id: 'au-iris' },
        { name: 'Scott', family_member_id: 'fm-scott', auth_user_id: 'au-scott' },
      ],
      shelf: [
        { recipe_id: 'rec-shrimp', title: 'Bittman Shrimp', tags: ['~80g'], prep_minutes: 15, kid_acceptance: 'Both kids eat this.', is_prep_friendly: false },
      ],
      habits: [
        { owner_auth_user_id: 'au-iris', name: 'Yogurt', slot: 'breakfast', grams_hint: 80 },
      ],
      brief: 'Bittman shrimp this week.',
    })
    expect(out).toContain('WEEK: 2026-04-27')
    expect(out).toContain('MEAL_PLAN_ID: mp-1')
    expect(out).toContain('Iris')
    expect(out).toContain('rec-shrimp')
    expect(out).toContain('Yogurt')
    expect(out).toContain('Bittman shrimp this week.')
  })

  it('handles empty shelf and empty habits gracefully', () => {
    const out = buildPromptContext({
      weekStart: '2026-04-27',
      mealPlanId: 'mp-1',
      members: [],
      shelf: [],
      habits: [],
      brief: 'something',
    })
    expect(out).toContain('SHELF (household, 0 recipes)')
    expect(out).toContain('STANDING HABITS:\n  (none)')
  })
})
