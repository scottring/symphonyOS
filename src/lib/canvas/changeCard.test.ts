import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/task'
import { opRow, opWhen, opWrite, type ChangeOp } from './changeCard'

const today = new Date(2026, 9, 14, 8, 0) // Wed Oct 14
const op = (x: Partial<ChangeOp>): ChangeOp => ({ key: 'k', op: 'place', title: 'Reply to Christian', ...x })
const task = (x: Partial<Task>) => ({ id: 'a', title: 'T', completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 9, 14), ...x }) as Task

describe('opRow', () => {
  it('makes display choices explicit before approval',()=>{
    expect(opRow(op({op:'routine_add',showOnTimeline:false}),today).where).toContain('Hidden from Today and Week · Kept in Routines')
    expect(opRow(op({op:'routine_change',showOnTimeline:true}),today)).toMatchObject({kind:'CHANGE',where:'→ Show in Today and Week'})
  })
  it('says where each change lands, in the card’s words', () => {
    expect(opRow(op({ date: '2026-10-14', time: '09:00' }), today)).toEqual({ kind: 'MOVE', title: 'Reply to Christian', where: '→ Today 9:00' })
    expect(opRow(op({ date: '2026-10-15', time: '13:30' }), today).where).toBe('→ Thu 1:30')
    expect(opRow(op({ date: '2026-10-16' }), today).where).toBe('→ Fri')
    expect(opRow(op({ op: 'unplace' }), today)).toMatchObject({ kind: 'MOVE', where: '→ No day yet' })
    expect(opRow(op({ op: 'add', title: 'Hold for WSWMD', date: '2026-10-14', time: '13:00' }), today)).toEqual({ kind: 'ADD', title: 'Hold for WSWMD', where: 'Today 1:00' })
    expect(opRow(op({ op: 'add', title: 'Call the bank' }), today).where).toBe('No day yet')
    expect(opRow(op({ op: 'someday' }), today)).toMatchObject({ kind: 'LATER', where: '→ Someday' })
    expect(opRow(op({ op: 'assign', assigneeName: 'Ella' }), today)).toMatchObject({ kind: 'WHO', where: '→ Ella' })
  })
})

describe('opWhen', () => {
  it('is local time, midnight without a time', () => {
    expect(opWhen(op({ date: '2026-10-15', time: '09:30' }))).toEqual(new Date(2026, 9, 15, 9, 30))
    expect(opWhen(op({ date: '2026-10-15' }))).toEqual(new Date(2026, 9, 15))
    expect(opWhen(op({ op: 'someday' }))).toBeUndefined()
  })
})

describe('opWrite', () => {
  it('a timed place is a timed task; a day place is the Week drop write', () => {
    const t = task({ bucket: 'week', scheduledFor: undefined })
    expect(opWrite(op({ date: '2026-10-15', time: '09:00' }), t).updates).toEqual({ scheduledFor: new Date(2026, 9, 15, 9, 0), isAllDay: false, bucket: 'timed' })
    expect(opWrite(op({ date: '2026-10-15' }), t).updates).toEqual({ isAllDay: true, scheduledFor: new Date(2026, 9, 15), bucket: 'timed' })
  })
  it('previous holds exactly what the write changes, so Undo restores it', () => {
    const t = task({ bucket: 'week', scheduledFor: undefined, isAllDay: undefined })
    expect(opWrite(op({ date: '2026-10-15' }), t).previous).toEqual({ isAllDay: undefined, scheduledFor: undefined, bucket: 'week' })
  })
  it('someday and assign', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 9, 14), isAllDay: true, assignedTo: 'm1', assignedToAll: ['m1'] })
    expect(opWrite(op({ op: 'someday' }), t).updates).toEqual({ bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    expect(opWrite(op({ op: 'assign', assignee: 'm2' }), t)).toEqual({ updates: { assignedTo: 'm2', assignedToAll: ['m2'] }, previous: { assignedTo: 'm1', assignedToAll: ['m1'] } })
  })
  it('unplace uses the planner’s own removal and its previous', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 9, 14), isAllDay: true })
    const w = opWrite(op({ op: 'unplace' }), t)
    expect(w.updates.scheduledFor).toBeUndefined()
    expect(w.previous.scheduledFor).toEqual(new Date(2026, 9, 14))
  })
})
