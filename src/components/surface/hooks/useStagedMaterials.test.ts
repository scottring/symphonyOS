import { describe, it, expect } from 'vitest'
import { deriveMaterials, type StagingContext } from './useStagedMaterials'
import type { TimelineItem } from '@/types/timeline'
import type { Contact } from '@/types/contact'

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'task-1',
    type: 'task',
    title: 'Test item',
    startTime: null,
    endTime: null,
    completed: false,
    ...overrides,
  }
}

const contact: Contact = {
  id: 'c1',
  name: 'Dr. Lewis',
  phone: '(612) 555-0148',
  category: 'medical',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('deriveMaterials', () => {
  it('returns nothing for a bare item', () => {
    expect(deriveMaterials(item())).toEqual([])
  })

  it('stages a phone from the item field (AUTO)', () => {
    const mats = deriveMaterials(item({ phoneNumber: '555-0100' }))
    const phone = mats.find((m) => m.type === 'phone')
    expect(phone).toBeDefined()
    expect(phone!.availability).toBe('auto')
    expect(phone!.action).toEqual({ kind: 'call', value: '555-0100' })
  })

  it('resolves phone + person from a linked contact (AUTO)', () => {
    const ctx: StagingContext = { contactsById: { c1: contact } }
    const mats = deriveMaterials(item({ contactId: 'c1' }), ctx)
    const phone = mats.find((m) => m.type === 'phone')
    const person = mats.find((m) => m.type === 'person')
    expect(phone?.action.value).toBe('(612) 555-0148')
    expect(phone?.source).toBe('from Contacts')
    expect(person?.label).toBe('Dr. Lewis')
    expect(person?.sublabel).toBe('medical')
  })

  it('prefers the item phone over the contact phone', () => {
    const ctx: StagingContext = { contactsById: { c1: contact } }
    const mats = deriveMaterials(item({ phoneNumber: '555-9999', contactId: 'c1' }), ctx)
    expect(mats.find((m) => m.type === 'phone')?.action.value).toBe('555-9999')
  })

  it('stages directions from a location (AUTO) with precise route when place id present', () => {
    const mats = deriveMaterials(item({ location: '123 Main St', locationPlaceId: 'place_abc' }))
    const dir = mats.find((m) => m.type === 'directions')
    expect(dir?.availability).toBe('auto')
    expect(dir?.action).toEqual({ kind: 'directions', value: 'place_abc' })
    expect(dir?.source).toBe('precise route')
  })

  it('falls back to the location string when no place id', () => {
    const mats = deriveMaterials(item({ location: '123 Main St' }))
    expect(mats.find((m) => m.type === 'directions')?.action.value).toBe('123 Main St')
  })

  it('stages each link (AUTO) and skips empty urls', () => {
    const mats = deriveMaterials(
      item({ links: [{ url: 'https://a.com', title: 'Referral' }, { url: '' }] }),
    )
    const links = mats.filter((m) => m.type === 'link')
    expect(links).toHaveLength(1)
    expect(links[0].label).toBe('Referral')
    expect(links[0].action).toEqual({ kind: 'href', value: 'https://a.com' })
  })

  it('stages attachment count when hydrated (AUTO)', () => {
    const mats = deriveMaterials(item(), { attachmentCountByItemId: { 'task-1': 3 } })
    expect(mats.find((m) => m.type === 'file')?.label).toBe('3 files')
  })

  it('stages routine-collection steps (AUTO) with next-up sublabel', () => {
    const mats = deriveMaterials(
      item({
        id: 'routine-9',
        type: 'routine-collection',
        collectionSteps: [
          { stepId: 's1', name: 'Glide', progress: { done: 0, total: 3 }, doses: [] },
          { stepId: 's2', name: 'Stretch', progress: { done: 0, total: 3 }, doses: [] },
        ],
        collectionNextUp: { stepId: 's1', stepName: 'Glide', time: null, doseSlot: 0 },
      }),
    )
    const steps = mats.find((m) => m.type === 'steps')
    expect(steps?.label).toBe('2 steps')
    expect(steps?.sublabel).toBe('Next: Glide')
    expect(steps?.action).toEqual({ kind: 'open-steps' })
  })

  it('stages a recipe (AUTO) and a grocery list (PARTIAL) for a meal item', () => {
    const mats = deriveMaterials(item(), {
      recipeByItemId: { 'task-1': { id: 'r1', title: 'Bittman shrimp', ingredientCount: 8 } },
    })
    expect(mats.find((m) => m.type === 'recipe')?.availability).toBe('auto')
    const grocery = mats.find((m) => m.type === 'grocery')
    expect(grocery?.availability).toBe('partial')
    expect(grocery?.sublabel).toBe('8 items')
  })

  it('stages a source email as PARTIAL', () => {
    const mats = deriveMaterials(item(), {
      emailByItemId: { 'task-1': { messageId: 'm1', subject: "Mia's referral", from: 'school@x.edu' } },
    })
    const email = mats.find((m) => m.type === 'email')
    expect(email?.availability).toBe('partial')
    expect(email?.action).toEqual({ kind: 'open-email', value: 'm1' })
  })
})
