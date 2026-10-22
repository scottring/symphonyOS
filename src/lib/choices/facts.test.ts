import { describe, it, expect } from 'vitest'
import { choiceSummary, optionFact, decidedSummary } from './facts'
import type { Choice, ChoiceOption, FollowUp } from '@/types/choice'

const NOW = new Date(2026, 9, 22, 12, 0)
const opt = (id: string, name: string, status: ChoiceOption['status'], changed = new Date(2026, 9, 10)): ChoiceOption => ({
  id, choiceId: 'c', userId: 'u', name, status, statusChangedAt: changed, values: {}, sortOrder: 0, updatedAt: changed,
})
const MARTINEZ = opt('m', 'Martinez Tile & Bath', 'heard_back')
const HARBOR = opt('h', 'Harbor', 'heard_back')
const CHES = opt('ch', 'Chesapeake', 'heard_back')
const ROB = opt('r', 'Rob', 'contacted', new Date(2026, 9, 16))
const BATHFITTER = opt('b', 'BathFitter', 'ruled_out')
const OPTIONS = [MARTINEZ, HARBOR, CHES, ROB, BATHFITTER]
const ROB_FU: FollowUp = { taskId: 't', optionId: 'r', title: 'Call Rob', scheduledFor: new Date(2026, 9, 22, 17, 0), completed: false, waitingSince: new Date(2026, 9, 16) }
const FOLLOW_UPS = [ROB_FU]

describe('facts', () => {
  it('summarises a choice', () => {
    expect(choiceSummary(OPTIONS, FOLLOW_UPS, NOW)).toBe('4 options · 3 heard back · 1 waiting 6 days · 1 ruled out')
    expect(choiceSummary([opt('a', 'A', 'considering')], [], NOW)).toBe('1 option · none heard back yet')
  })
  it('singular day, falls back to statusChangedAt, ignores completed', () => {
    const fu: FollowUp = { ...ROB_FU, waitingSince: undefined }
    const o = opt('r', 'Rob', 'contacted', new Date(2026, 9, 21, 9, 0))
    expect(choiceSummary([o], [fu], NOW)).toBe('1 option · none heard back yet · 1 waiting 1 day')
    expect(choiceSummary([o], [{ ...fu, completed: true }], NOW)).toBe('1 option · none heard back yet')
  })
  it('counts as waiting only options still Contacted', () => {
    const open = (id: string): FollowUp => ({ ...ROB_FU, taskId: `t-${id}`, optionId: id, waitingSince: new Date(2026, 9, 2) })
    const heard = opt('hb', 'Heard', 'heard_back')
    const out = opt('ro', 'Out', 'ruled_out')
    const chosen = opt('co', 'Chosen', 'chosen')
    const considering = opt('cn', 'Considering', 'considering')
    // Their open follow-ups are older, but only Rob (Contacted) is waiting.
    expect(choiceSummary([ROB, heard, out, chosen, considering], [ROB_FU, open('hb'), open('ro'), open('co'), open('cn')], NOW))
      .toBe('4 options · 1 heard back · 1 waiting 6 days · 1 ruled out')
    expect(choiceSummary([heard], [open('hb')], NOW)).toBe('1 option · 1 heard back')
  })
  it('states an option fact', () => {
    expect(optionFact(ROB, ROB_FU, NOW)).toBe('Contacted Oct 16 · no reply · follow-up Thu')
    expect(optionFact(ROB, undefined, NOW)).toBe('Contacted Oct 16 · no reply')
    expect(optionFact(MARTINEZ, undefined, NOW)).toBeNull()
    expect(optionFact(ROB, { ...ROB_FU, scheduledFor: new Date(2026, 9, 30) }, NOW)).toBe('Contacted Oct 16 · no reply · follow-up Oct 30')
  })
  it('summarises a decision', () => {
    const c = { decidedAt: new Date(2026, 9, 30), chosenOptionId: 'm', decidedWork: ['main', 'hall'], decidedAmountCents: 2820000,
      work: [{ id: 'main', label: 'Main bath' }, { id: 'hall', label: 'Hall bath' }, { id: 'kids', label: "Kids' bath" }] } as unknown as Choice
    expect(decidedSummary(c, OPTIONS)).toBe('Chose Martinez Tile & Bath · Oct 30 · Main bath + Hall bath · $28,200')
    expect(decidedSummary({ ...c, decidedWork: [], decidedAmountCents: undefined }, OPTIONS)).toBe('Chose Martinez Tile & Bath · Oct 30')
  })
})
