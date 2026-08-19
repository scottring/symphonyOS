import { describe, it, expect } from 'vitest'
import { neededToday, NEEDED_TODAY_VISIBLE, NEEDED_TODAY_EXPANDED_MAX } from './neededToday'
import type { Task } from '@/types/task'
import type { ListItem } from '@/types/list'

const DAY = new Date(2026, 7, 19)

function task(over: Partial<Task>): Task {
  return {
    id: 't', title: 'Task', completed: false, scheduledFor: null, context: null,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as Task
}

function item(over: Partial<ListItem>): ListItem {
  return {
    id: 'i', listId: 'shop', text: 'Item', sortOrder: 0, completed: false,
    createdAt: DAY, updatedAt: DAY, ...over,
  } as ListItem
}

const SHOPPING = new Set(['shop'])

describe('neededToday', () => {
  it('includes only items marked for the viewed day', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY }), task({ id: 'b', neededOn: new Date(2026, 7, 18) }), task({ id: 'c' })],
      [], DAY, SHOPPING,
    )
    expect(items.map(i => i.id)).toEqual(['a'])
  })

  it('matches by calendar day, ignoring time of day', () => {
    const { items } = neededToday([task({ id: 'a', neededOn: new Date(2026, 7, 19, 23, 30) })], [], DAY, SHOPPING)
    expect(items).toHaveLength(1)
  })

  it('excludes completed items from both sources', () => {
    const { items } = neededToday(
      [task({ id: 'a', neededOn: DAY, completed: true })],
      [item({ id: 'i1', neededOn: DAY, completed: true })],
      DAY, SHOPPING,
    )
    expect(items).toEqual([])
  })

  it('derives kind: shopping list item is buy, needsDiscussion is discuss, else urgent', () => {
    const { items } = neededToday(
      [task({ id: 'd', neededOn: DAY, needsDiscussion: true }), task({ id: 'u', neededOn: DAY })],
      [item({ id: 'b', neededOn: DAY })],
      DAY, SHOPPING,
    )
    expect(items.find(i => i.id === 'd')!.kind).toBe('discuss')
    expect(items.find(i => i.id === 'u')!.kind).toBe('urgent')
    expect(items.find(i => i.id === 'b')!.kind).toBe('buy')
  })

  it('treats a non-shopping list item as urgent, not buy', () => {
    const { items } = neededToday([], [item({ id: 'x', listId: 'other', neededOn: DAY })], DAY, SHOPPING)
    expect(items[0].kind).toBe('urgent')
  })

  it('sorts discuss, then buy, then urgent', () => {
    const { items } = neededToday(
      [task({ id: 'u', neededOn: DAY }), task({ id: 'd', neededOn: DAY, needsDiscussion: true })],
      [item({ id: 'b', neededOn: DAY })],
      DAY, SHOPPING,
    )
    expect(items.map(i => i.kind)).toEqual(['discuss', 'buy', 'urgent'])
  })

  it('uses list item text as the title', () => {
    const { items } = neededToday([], [item({ id: 'b', neededOn: DAY, text: 'Pull-ups' })], DAY, SHOPPING)
    expect(items[0].title).toBe('Pull-ups')
  })

  it('caps visible items and reports the overflow count', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING)
    expect(items).toHaveLength(NEEDED_TODAY_VISIBLE)
    expect(overflow).toBe(3)
  })

  it('reports zero overflow when under the cap', () => {
    const { overflow } = neededToday([task({ id: 'a', neededOn: DAY })], [], DAY, SHOPPING)
    expect(overflow).toBe(0)
  })

  it('returns everything with no overflow when visible is Infinity', () => {
    const many = Array.from({ length: 8 }, (_, n) => task({ id: `t${n}`, neededOn: DAY }))
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING, Infinity)
    expect(items).toHaveLength(8)
    expect(overflow).toBe(0)
  })

  // The expanded note is a bigger budget, not an unbounded one — Today is a
  // fixed-space surface and the note must never be able to push the day off it.
  it('still folds past the expanded cap', () => {
    const many = Array.from(
      { length: NEEDED_TODAY_EXPANDED_MAX + 4 },
      (_, n) => task({ id: `t${n}`, neededOn: DAY }),
    )
    const { items, overflow } = neededToday(many, [], DAY, SHOPPING, NEEDED_TODAY_EXPANDED_MAX)
    expect(items).toHaveLength(NEEDED_TODAY_EXPANDED_MAX)
    expect(overflow).toBe(4)
  })
})
