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
      restrictions: [],
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
      restrictions: [],
      brief: 'something',
    })
    expect(out).toContain('SHELF (household, 0 recipes)')
    expect(out).toContain('STANDING HABITS:\n  (none)')
  })

  it('escapes user-controlled strings with quotes safely', () => {
    const out = buildPromptContext({
      weekStart: '2026-04-27',
      mealPlanId: 'mp-1',
      members: [{ name: 'Iris "The Great"', family_member_id: 'fm-iris', auth_user_id: null }],
      shelf: [{ recipe_id: 'rec-1', title: 'A "fancy" dish', tags: [], prep_minutes: null, kid_acceptance: null, is_prep_friendly: false }],
      habits: [{ owner_auth_user_id: 'au-1', name: 'Eat "well"', slot: 'breakfast', grams_hint: null }],
      restrictions: [],
      brief: 'with "quotes" inside',
    })
    expect(out).toContain('"Iris \\"The Great\\""')
    expect(out).toContain('"A \\"fancy\\" dish"')
    expect(out).toContain('"Eat \\"well\\""')
  })
})

import * as denoMirror from '../../supabase/functions/_shared/mealPlanGenerate'

describe('Node ↔ Deno mirror equivalence', () => {
  const FIXTURE = {
    weekStart: '2026-04-27',
    mealPlanId: 'mp-1',
    members: [
      { name: 'Iris',  family_member_id: 'fm-iris',  auth_user_id: 'au-iris' },
      { name: 'Scott "with quotes"', family_member_id: 'fm-scott', auth_user_id: null },
    ],
    shelf: [
      { recipe_id: 'rec-1', title: 'Bittman Shrimp', tags: ['~80g', 'quick'], prep_minutes: 15, kid_acceptance: 'Both kids eat this.', is_prep_friendly: false },
    ],
    habits: [
      { owner_auth_user_id: 'au-iris', name: 'Yogurt + tomatoes', slot: 'breakfast', grams_hint: 80 },
    ],
    restrictions: [
      { scope: 'household' as const, person_name: null, label: 'gluten-free' },
      { scope: 'person' as const, person_name: 'Iris', label: 'no shellfish' },
    ],
    brief: '800g challenge · No "stir fry" this week',
  }

  it('buildPromptContext produces identical output in src and Deno mirror', async () => {
    const { buildPromptContext: srcFn } = await import('./mealPlanValidation')
    expect(denoMirror.buildPromptContext(FIXTURE)).toBe(srcFn(FIXTURE))
  })

  it('validateGeneratedEntries produces identical output in src and Deno mirror', async () => {
    const { validateGeneratedEntries: srcFn } = await import('./mealPlanValidation')
    const ROSTER = new Set(['fm-iris'])
    const SHELF = new Set(['rec-1'])
    const ENTRIES = [
      { day_of_week: 0, slot: 'breakfast', family_member_id: 'fm-iris', recipe_id: null, ad_hoc_title: 'Yogurt' },
      { day_of_week: 7, slot: 'dinner', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null },  // out of range
    ]
    expect(JSON.stringify(denoMirror.validateGeneratedEntries(ENTRIES, ROSTER, SHELF)))
      .toBe(JSON.stringify(srcFn(ENTRIES, ROSTER, SHELF)))
  })
})

describe('validateGeneratedEntries — prep + leftover + soft drop', () => {
  const roster = new Set(['fm-iris', 'fm-scott'])
  const shelf = new Set(['rec-1'])

  it('accepts prep as a canonical slot', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 6, slot: 'prep', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null }],
      roster, shelf,
    )
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0].slot).toBe('prep')
  })

  it('preserves leftover_from string', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'lunch', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null, leftover_from: 'prep_1' }],
      roster, shelf,
    )
    expect(r.kept[0].leftover_from).toBe('prep_1')
  })

  it('demotes a hallucinated recipe_id to ad-hoc when title is present', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'dinner', family_member_id: null, recipe_id: 'rec-fake', ad_hoc_title: 'Salmon something', leftover_from: null }],
      roster, shelf,
    )
    expect(r.dropped).toHaveLength(0)
    expect(r.kept[0].recipe_id).toBeNull()
    expect(r.kept[0].ad_hoc_title).toBe('Salmon something')
  })

  it('still drops recipe_id miss with no title', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'dinner', family_member_id: null, recipe_id: 'rec-fake', ad_hoc_title: null, leftover_from: null }],
      roster, shelf,
    )
    expect(r.kept).toHaveLength(0)
    expect(r.dropped[0].reason).toMatch(/recipe_id not in shelf/)
  })

  it('rejects prepared_by not in roster', () => {
    const r = validateGeneratedEntries(
      [{ day_of_week: 1, slot: 'dinner', family_member_id: null, recipe_id: 'rec-1', ad_hoc_title: null, prepared_by_family_member_id: 'fm-fake' }],
      roster, shelf,
    )
    expect(r.kept).toHaveLength(0)
    expect(r.dropped[0].reason).toMatch(/prepared_by_family_member_id not in roster/)
  })
})
