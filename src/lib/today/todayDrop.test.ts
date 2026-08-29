import { describe, it, expect, vi } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { emptySections } from '@/lib/today/types'
import {
  resolveDrop, refusalFor, computeBandDropTime,
  bandDropId, gapDropId, rowDropId, NEW_GROUP_NAME,
  writeMoveAndRegisterUndo,
  type DropContext,
} from './todayDrop'

const DAY = new Date(2026, 6, 25)

function item(over: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    type: 'task', title: over.id, startTime: null, endTime: null, completed: false,
    ...over,
  } as TimelineItem
}

function ctx(over: Partial<DropContext>): DropContext {
  return {
    activeId: 'task-a',
    overId: bandDropId('morning'),
    sections: emptySections<TimelineItem>(),
    fullOrderIds: {},
    orders: new Map(),
    viewedDate: DAY,
    isReadOnlyEvent: () => false,
    groupMembersOf: () => [],
    ...over,
  }
}

describe('refusalFor', () => {
  it('refuses an event on a read-only calendar', () => {
    expect(refusalFor(item({ id: 'event-1', type: 'event' }), () => true)).toMatch(/read-only/i)
  })
  it('allows an event on a writable calendar', () => {
    expect(refusalFor(item({ id: 'event-1', type: 'event' }), () => false)).toBeNull()
  })
  it('refuses a synthetic meal item', () => {
    expect(refusalFor(item({ id: 'meal:mon-dinner', type: 'event' }), () => false)).toMatch(/meal/i)
  })
  it('refuses a routine collection', () => {
    expect(refusalFor(item({ id: 'routine-collection-1', type: 'routine-collection' }), () => false)).toBeTruthy()
  })
  it('refuses a DOSED routine step', () => {
    // grouping.ts applies a deferred_to override by BARE id only, so a dosed
    // step's override would silently land on the wrong dose.
    expect(refusalFor(item({ id: 'routine-r1#2', type: 'routine' }), () => false)).toMatch(/dose/i)
  })
  it('allows an undosed routine', () => {
    expect(refusalFor(item({ id: 'routine-r1', type: 'routine' }), () => false)).toBeNull()
  })
  it('allows a plain task', () => {
    expect(refusalFor(item({ id: 'task-a' }), () => false)).toBeNull()
  })
})

describe('computeBandDropTime', () => {
  it('uses the band start when the band is empty', () => {
    const when = computeBandDropTime('morning', [], DAY)
    expect(when.getHours()).toBe(8)
    expect(when.getMinutes()).toBe(0)
  })
  it("uses the last item's end time when the band is occupied", () => {
    const when = computeBandDropTime('morning', [
      item({ id: 'x', startTime: new Date(2026, 6, 25, 9), endTime: new Date(2026, 6, 25, 9, 30) }),
    ], DAY)
    expect(when.getHours()).toBe(9)
    expect(when.getMinutes()).toBe(30)
  })
  it('falls back to startTime when an item has no end', () => {
    const when = computeBandDropTime('afternoon', [
      item({ id: 'x', startTime: new Date(2026, 6, 25, 14) }),
    ], DAY)
    expect(when.getHours()).toBe(14)
  })
  it('never returns a time outside its own band', () => {
    // A 20:45 item in Evening (17:00-20:59) must not push the drop into Night.
    const when = computeBandDropTime('evening', [
      item({ id: 'x', startTime: new Date(2026, 6, 25, 20, 45) }),
    ], DAY)
    expect(when.getHours()).toBeLessThanOrEqual(20)
  })
  it('ignores items with no time at all', () => {
    const when = computeBandDropTime('evening', [item({ id: 'x' })], DAY)
    expect(when.getHours()).toBe(17)
  })
})

describe('resolveDrop — bands', () => {
  it('a band drop gives an item a time', () => {
    const a = item({ id: 'task-a' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: bandDropId('evening'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('set-time')
    if (out[0].kind === 'set-time') expect(out[0].when.getHours()).toBe(17)
  })

  it('the All day band clears the time', () => {
    const a = item({ id: 'task-a', startTime: new Date(2026, 6, 25, 9) })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: bandDropId('allday'),
      sections: { ...emptySections<TimelineItem>(), morning: [a] },
    }))
    expect(out).toEqual([{ kind: 'make-all-day', itemId: 'task-a' }])
  })

  it('a read-only event refuses instead of being retimed', () => {
    const ev = item({ id: 'event-1', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'event-1', overId: bandDropId('evening'),
      sections: { ...emptySections<TimelineItem>(), morning: [ev] },
      isReadOnlyEvent: () => true,
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('refuse')
  })

  it('dragging a group CHILD onto a band leaves the group and takes the time', () => {
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: bandDropId('afternoon'),
      sections: { ...emptySections<TimelineItem>(), allday: [child] },
    }))
    expect(out.map((i) => i.kind)).toEqual(['remove-from-group', 'set-time'])
  })

  it('dragging a group child onto All day leaves the group and clears the time', () => {
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: bandDropId('allday'),
      sections: { ...emptySections<TimelineItem>(), morning: [child] },
    }))
    expect(out.map((i) => i.kind)).toEqual(['remove-from-group', 'make-all-day'])
  })

  it('the Unscheduled band is not a drop target', () => {
    const a = item({ id: 'task-a' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: bandDropId('unscheduled'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))
    expect(out).toEqual([])
  })
})

describe('resolveDrop — gaps (reorder)', () => {
  const a = item({ id: 'task-a' })
  const b = item({ id: 'task-b' })
  const c = item({ id: 'task-c' })
  const untimed = { ...emptySections<TimelineItem>(), allday: [a, b, c] }

  it('reordering in an untimed band writes sort orders', () => {
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: gapDropId('allday', 1),
      sections: untimed,
      fullOrderIds: { allday: ['a', 'b', 'c'] },
      orders: new Map([['a', 0], ['b', 1000], ['c', 2000]]),
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('reorder')
    if (out[0].kind === 'reorder') expect(out[0].writes[0].id).toBe('c')
  })

  it('reorders against the FULL untimed set, not the rendered subset', () => {
    // Stage 2a residual 3: renormalising a filtered subset resets it to
    // 0…n×1000 while hidden siblings keep their old values and interleave.
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: gapDropId('allday', 0),
      sections: { ...emptySections<TimelineItem>(), allday: [c] }, // only c rendered
      fullOrderIds: { allday: ['a', 'b', 'c'] },
      orders: new Map([['a', null], ['b', null], ['c', null]]),
    }))
    expect(out[0].kind).toBe('reorder')
    if (out[0].kind === 'reorder') {
      expect(out[0].writes.map((w) => w.id).sort()).toEqual(['a', 'b', 'c'])
    }
  })

  it('reordering into a TIMED band rewrites the time instead', () => {
    // Spec move 3: reordering a timed item rewrites its time, so the list stays
    // genuinely time-sorted rather than layering manual order on top of it.
    const nine = item({ id: 'task-9', startTime: new Date(2026, 6, 25, 9), endTime: new Date(2026, 6, 25, 9, 30) })
    const ten = item({ id: 'task-10', startTime: new Date(2026, 6, 25, 10) })
    const out = resolveDrop(ctx({
      activeId: 'task-10', overId: gapDropId('morning', 1),
      sections: { ...emptySections<TimelineItem>(), morning: [nine, ten] },
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('set-time')
    if (out[0].kind === 'set-time') {
      expect(out[0].when.getHours()).toBe(9)
      expect(out[0].when.getMinutes()).toBe(30)
    }
  })

  it('dropping at the top of a timed band takes the band start', () => {
    const nine = item({ id: 'task-9', startTime: new Date(2026, 6, 25, 9) })
    const out = resolveDrop(ctx({
      activeId: 'task-9', overId: gapDropId('afternoon', 0),
      sections: { ...emptySections<TimelineItem>(), afternoon: [nine] },
    }))
    expect(out[0].kind).toBe('set-time')
    if (out[0].kind === 'set-time') expect(out[0].when.getHours()).toBe(12)
  })

  it('no untouched item is retimed — the drop writes exactly one intent', () => {
    const nine = item({ id: 'task-9', startTime: new Date(2026, 6, 25, 9) })
    const ten = item({ id: 'task-10', startTime: new Date(2026, 6, 25, 10) })
    const eleven = item({ id: 'task-11', startTime: new Date(2026, 6, 25, 11) })
    const out = resolveDrop(ctx({
      activeId: 'task-11', overId: gapDropId('morning', 1),
      sections: { ...emptySections<TimelineItem>(), morning: [nine, ten, eleven] },
    }))
    expect(out).toHaveLength(1) // no cascade
  })

  it('a no-op reorder produces no intents', () => {
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: gapDropId('allday', 0),
      sections: untimed,
      fullOrderIds: { allday: ['a', 'b', 'c'] },
      orders: new Map([['a', 0], ['b', 1000], ['c', 2000]]),
    }))
    expect(out).toEqual([])
  })

  it('the Unscheduled gap is not a reorder target', () => {
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: gapDropId('unscheduled', 0),
      sections: { ...emptySections<TimelineItem>(), unscheduled: [a] },
    }))
    expect(out).toEqual([])
  })
})

describe('resolveDrop — rows (grouping)', () => {
  it('two loose cards become a NEW group holding both, named neutrally', () => {
    const a = item({ id: 'task-a', title: 'Pick up dry cleaning' })
    const b = item({ id: 'task-b', title: 'Morning errands' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [a, b] },
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].groupName).toBe(NEW_GROUP_NAME)
      // BOTH cards go in — neither is the parent of the other.
      expect(out[0].taskIds).toEqual(['a', 'b'])
      expect(out[0].isAllDay).toBe(true)
    }
  })

  it('never names the wrapper after a card it contains', () => {
    // Naming it after the target put that title on two rows at once — the
    // wrapper and its own child — which reads as the dragged item duplicating
    // and the target being replaced. Reported from real use.
    const a = item({ id: 'task-a', title: 'Pick up dry cleaning' })
    const b = item({ id: 'task-b', title: 'Morning errands' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [a, b] },
    }))
    if (out[0].kind === 'create-group') {
      expect(out[0].groupName).not.toBe('Morning errands')
      expect(out[0].groupName).not.toBe('Pick up dry cleaning')
    }
  })

  it('a second drop onto the new group JOINS it — no second wrapper', () => {
    // The group now exists, so its header row means "add to me".
    const wrapper = item({ id: 'task-w1', title: NEW_GROUP_NAME })
    const first = item({ id: 'task-a', isSubtask: true, parentTaskId: 'w1' })
    const c = item({ id: 'task-c', title: 'Two' })
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: rowDropId('task-w1'),
      sections: { ...emptySections<TimelineItem>(), allday: [wrapper, first, c] },
    }))
    expect(out[0].kind).toBe('add-to-group')
    if (out[0].kind === 'add-to-group') {
      expect(out[0].wrapperId).toBe('w1')
      expect(out[0].taskIds).toEqual(['c'])
    }
  })

  it('dropping onto a card INSIDE a group joins that group, not a nested one', () => {
    const wrapper = item({ id: 'task-w1', title: 'Errands' })
    const child = item({ id: 'task-c', title: 'Milk', isSubtask: true, parentTaskId: 'w1' })
    const a = item({ id: 'task-a', title: 'Bread' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-c'),
      sections: { ...emptySections<TimelineItem>(), allday: [wrapper, child, a] },
    }))
    expect(out[0].kind).toBe('add-to-group')
    if (out[0].kind === 'add-to-group') expect(out[0].wrapperId).toBe('w1')
  })

  it('a card onto an EXISTING group adds to it', () => {
    const wrapper = item({ id: 'task-w1', title: 'Errands' })
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const ev = item({ id: 'event-e9', type: 'event', title: 'Dentist' })
    const out = resolveDrop(ctx({
      activeId: 'event-e9', overId: rowDropId('task-w1'),
      sections: { ...emptySections<TimelineItem>(), allday: [wrapper, child, ev] },
      groupMembersOf: () => [{ type: 'routine', id: 'r5' }],
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('add-to-group')
    if (out[0].kind === 'add-to-group') {
      expect(out[0].wrapperId).toBe('w1')
      expect(out[0].memberRefs).toEqual([{ type: 'event', id: 'e9' }])
      expect(out[0].taskIds).toEqual([])
    }
  })

  it('an event dropped on a plain task groups the two as peers', () => {
    const t = item({ id: 'task-b', title: 'Errands' })
    const ev = item({ id: 'event-e9', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'event-e9', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [t, ev] },
    }))
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].taskIds).toEqual(['b'])
      expect(out[0].memberRefs).toEqual([{ type: 'event', id: 'e9' }])
    }
  })

  it('a card dropped on an EVENT wraps both — an event cannot be a parent', () => {
    const t = item({ id: 'task-a', title: 'Prep' })
    const ev = item({ id: 'event-e9', type: 'event', title: 'Dentist' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('event-e9'),
      sections: { ...emptySections<TimelineItem>(), allday: [t, ev] },
    }))
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].groupName).toBe(NEW_GROUP_NAME)
      expect(out[0].taskIds).toEqual(['a'])
      expect(out[0].memberRefs).toEqual([{ type: 'event', id: 'e9' }])
    }
  })

  it('an undosed routine joins a group by its bare id', () => {
    const wrapper = item({ id: 'task-w1', title: 'Errands' })
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const r = item({ id: 'routine-r7', type: 'routine' })
    const out = resolveDrop(ctx({
      activeId: 'routine-r7', overId: rowDropId('task-w1'),
      sections: { ...emptySections<TimelineItem>(), allday: [wrapper, child, r] },
    }))
    expect(out[0].kind).toBe('add-to-group')
    if (out[0].kind === 'add-to-group') {
      expect(out[0].memberRefs).toEqual([{ type: 'routine', id: 'r7' }])
    }
  })

  it('a group formed in a timed band is not all-day', () => {
    const a = item({ id: 'task-a', startTime: new Date(2026, 6, 25, 9) })
    const b = item({ id: 'task-b', title: 'Target', startTime: new Date(2026, 6, 25, 10) })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), morning: [a, b] },
    }))
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') expect(out[0].isAllDay).toBe(false)
  })

  it('an All Day group is dated MIDNIGHT, never the current clock time', () => {
    // viewedDate is a live `new Date()` and carries a wall-clock time. Passing
    // it through stamped the group with the instant of the drop.
    const noon = new Date(2026, 6, 25, 12, 34, 56)
    const a = item({ id: 'task-a' })
    const b = item({ id: 'task-b', title: 'Errands' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-b'), viewedDate: noon,
      sections: { ...emptySections<TimelineItem>(), allday: [a, b] },
    }))
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].date.getHours()).toBe(0)
      expect(out[0].date.getMinutes()).toBe(0)
      expect(out[0].date.getSeconds()).toBe(0)
    }
  })

  it("a timed group inherits the TARGET's time, not the moment of the drop", () => {
    // This one retimed a real 7:00 PM commitment to 9:09 PM on :5173.
    const dropInstant = new Date(2026, 6, 25, 21, 9, 26)
    const a = item({ id: 'task-a' })
    const b = item({ id: 'task-b', title: 'Pizza', startTime: new Date(2026, 6, 25, 19, 0) })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-b'), viewedDate: dropInstant,
      sections: { ...emptySections<TimelineItem>(), evening: [a, b] },
    }))
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].date.getHours()).toBe(19)
      expect(out[0].date.getMinutes()).toBe(0)
      expect(out[0].isAllDay).toBe(false)
    }
  })

  it('add-to-group inherits the wrapper\'s time too', () => {
    const dropInstant = new Date(2026, 6, 25, 21, 9, 26)
    const wrapper = item({ id: 'task-w1', title: 'Errands', startTime: new Date(2026, 6, 25, 14, 30) })
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const a = item({ id: 'task-a' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-w1'), viewedDate: dropInstant,
      sections: { ...emptySections<TimelineItem>(), afternoon: [wrapper, child, a] },
    }))
    expect(out[0].kind).toBe('add-to-group')
    if (out[0].kind === 'add-to-group') {
      expect(out[0].date.getHours()).toBe(14)
      expect(out[0].date.getMinutes()).toBe(30)
    }
  })

  it('dropping a card on itself does nothing', () => {
    const a = item({ id: 'task-a' })
    expect(resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-a'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))).toEqual([])
  })

  it('a read-only event refuses to be grouped too', () => {
    const t = item({ id: 'task-b' })
    const ev = item({ id: 'event-e9', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'event-e9', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [t, ev] },
      isReadOnlyEvent: () => true,
    }))
    expect(out[0].kind).toBe('refuse')
  })

  it('will not group ONTO a refused item either', () => {
    // Grouping a read-only event under a wrapper would reparent nothing and
    // silently do half the job.
    const t = item({ id: 'task-a' })
    const ev = item({ id: 'event-e9', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('event-e9'),
      sections: { ...emptySections<TimelineItem>(), allday: [t, ev] },
      isReadOnlyEvent: () => true,
    }))
    expect(out).toEqual([])
  })
})

describe('resolveDrop — nothing to do', () => {
  it('returns no intents for an unknown active id', () => {
    expect(resolveDrop(ctx({ activeId: 'task-nope' }))).toEqual([])
  })
  it('returns no intents for an unrecognised drop target', () => {
    const a = item({ id: 'task-a' })
    expect(resolveDrop(ctx({
      activeId: 'task-a', overId: 'something-else',
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))).toEqual([])
  })
  it('returns no intents when the row target no longer exists', () => {
    const a = item({ id: 'task-a' })
    expect(resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-gone'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))).toEqual([])
  })
})

describe('drop id helpers round-trip', () => {
  it('encodes ids that survive item ids containing separators', () => {
    // Meal ids carry a colon and dosed routine ids a hash — a row id must not
    // be confusable with a gap id because of them.
    expect(rowDropId('meal:mon-dinner')).toBe('today-row-meal:mon-dinner')
    expect(rowDropId('routine-r1#2')).toBe('today-row-routine-r1#2')
    expect(gapDropId('allday', 12)).toBe('today-gap-allday:12')
    expect(bandDropId('earlyMorning')).toBe('today-band-earlyMorning')
  })
})

// TodayView's applyIntents 'set-time'/'make-all-day' branches call
// onUpdateTask — the GATED handler — then decide whether to show a
// "Moved · Undo" toast. The bug this guards against: dragging an Unsorted
// task onto the timeline used to register the undo (and its toast)
// synchronously, before/regardless of the DomainGate dialog's answer.
describe('writeMoveAndRegisterUndo', () => {
  const next = { bucket: 'timed' as const, scheduledFor: DAY, isAllDay: false }
  const previous = { bucket: 'inbox' as const, scheduledFor: undefined, isAllDay: undefined }

  it('registers no undo when the gate is cancelled (onUpdateTask resolves false)', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(false)
    const registerUndo = vi.fn()

    const ok = await writeMoveAndRegisterUndo(onUpdateTask, 't1', next, previous, 'Moved "x"', registerUndo)

    expect(ok).toBe(false)
    expect(onUpdateTask).toHaveBeenCalledWith('t1', next)
    expect(registerUndo).not.toHaveBeenCalled()
  })

  it('registers the undo when the write goes through (resolves true, or a raw void handler)', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(true)
    const registerUndo = vi.fn()

    const ok = await writeMoveAndRegisterUndo(onUpdateTask, 't1', next, previous, 'Moved "x"', registerUndo)

    expect(ok).toBe(true)
    expect(registerUndo).toHaveBeenCalledWith('Moved "x"', expect.any(Function))

    // The undo entry itself writes the captured previous state.
    const undoFn = registerUndo.mock.calls[0][1] as () => void
    onUpdateTask.mockClear()
    undoFn()
    expect(onUpdateTask).toHaveBeenCalledWith('t1', previous)
  })

  it('registers no undo when there is no previous state to restore, even on a successful write', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(true)
    const registerUndo = vi.fn()

    const ok = await writeMoveAndRegisterUndo(onUpdateTask, 't1', next, undefined, 'Moved "x"', registerUndo)

    expect(ok).toBe(true)
    expect(registerUndo).not.toHaveBeenCalled()
  })
})
