import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/task'
import { choiceHeading, isChoiceOp, opRow, opScope, opWhen, opWrite, type ChangeOp } from './changeCard'

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

describe('choice rows', () => {
  const c = (x: Partial<ChangeOp>): ChangeOp => ({ key: 'c', op: 'choice_add', title: 'Contractor', choiceId: 'ch1', choiceTitle: 'Contractor', goalTitle: 'Redo the bathrooms', ...x })
  const opt = { optionId: 'o1', optionName: 'Chesapeake Renovations' }
  it('names each choice change in the card’s words', () => {
    expect(opRow(c({ op: 'choice_add', choiceId: undefined }), today)).toEqual({ kind: 'NEW', title: 'Contractor', where: '' })
    expect(opRow(c({ op: 'option_add', optionName: 'Martinez Tile & Bath', phone: '410-555-0142' }), today)).toEqual({ kind: 'ADD', title: 'Martinez Tile & Bath', where: '410-555-0142' })
    expect(opRow(c({ op: 'option_add', optionName: 'Rob' }), today).where).toBe('')
    expect(opRow(c({ op: 'option_status', ...opt, status: 'heard_back' }), today)).toEqual({ kind: 'STATUS', title: 'Chesapeake Renovations', where: '→ Heard back' })
    expect(opRow(c({ op: 'price_line', ...opt, workLabels: ['Main bath', 'Hall bath'], amountCents: 2700000 }), today)).toEqual({ kind: 'PRICE', title: 'Chesapeake Renovations · Main bath + Hall bath, together', where: '$27,000' })
    expect(opRow(c({ op: 'price_line', ...opt, workLabels: ['Main bath'], amountCents: 1975000 }), today)).toEqual({ kind: 'PRICE', title: 'Chesapeake Renovations · Main bath', where: '$19,750' })
    expect(opRow(c({ op: 'price_line', ...opt, workLabels: [], amountCents: 1840050 }), today)).toEqual({ kind: 'PRICE', title: 'Chesapeake Renovations · Price', where: '$18,400.50' })
    expect(opRow(c({ op: 'column_add', columnId: 'w', columnLabel: 'Warranty', columnKind: 'text' }), today)).toEqual({ kind: 'COLUMN', title: 'Warranty', where: '(text)' })
    expect(opRow(c({ op: 'column_add', columnId: 'p', columnLabel: 'Permit', columnKind: 'yesno' }), today).where).toBe('(yes/no)')
    expect(opRow(c({ op: 'work_set', workIds: ['k'], workLabels: ["Kids' bath"], description: 'Tile and fixtures only' }), today)).toEqual({ kind: 'WORK', title: "Kids' bath", where: 'Tile and fixtures only' })
    expect(opRow(c({ op: 'work_set', workIds: ['k'], workLabels: ["Kids' bath"] }), today).where).toBe('')
    expect(opRow(c({ op: 'choice_choose', optionName: 'Martinez Tile & Bath', note: 'Earliest start' }), today)).toEqual({ kind: 'CHOOSE', title: 'Martinez Tile & Bath', where: '“Earliest start”' })
    expect(opRow(c({ op: 'choice_choose', optionName: 'Martinez Tile & Bath' }), today).where).toBe('')
    expect(opRow(c({ op: 'choice_reopen' }), today)).toEqual({ kind: 'REOPEN', title: 'Contractor', where: '' })
    expect(opRow(c({ op: 'follow_up', optionName: "Rob (Dave's cousin)", date: '2026-10-15' }), today)).toEqual({ kind: 'FOLLOW UP', title: "Rob (Dave's cousin)", where: 'Thu' })
    expect(opRow(c({ op: 'follow_up', optionName: 'Rob', date: '2026-10-14' }), today).where).toBe('Today')
  })
  it('a SET row shows the value as the comparison does', () => {
    const set = (columnKind: ChangeOp['columnKind'], value: ChangeOp['value']) => opRow(c({ op: 'option_set', ...opt, columnLabel: 'Earliest start', columnKind, value }), today)
    expect(set('date', '2026-12-01')).toEqual({ kind: 'SET', title: 'Chesapeake Renovations · Earliest start', where: 'Dec 1' })
    expect(set('money', 1840000).where).toBe('$18,400')
    expect(set('yesno', true).where).toBe('Yes')
    expect(set('yesno', false).where).toBe('No')
    expect(set('text', '5 years').where).toBe('5 years')
  })
  it('choice rows sit under the goal and the choice', () => {
    expect(opScope(c({ op: 'option_status' }))).toBe('choice')
    expect(opScope(c({ op: 'follow_up' }))).toBe('choice')
    expect(choiceHeading(c({ op: 'option_status' }))).toBe('Redo the bathrooms · Contractor')
  })
})

describe('log and plan rows', () => {
  const goal = { goalTaskId: 'g1', goalTitle: 'Redo the bathrooms' }
  const opt = { choiceId: 'ch1', choiceTitle: 'Contractor', goalTitle: 'Redo the bathrooms', optionId: 'o1', optionName: 'Scher Remodeling' }
  const ev = (x: Partial<ChangeOp>): ChangeOp => ({ key: 'e', op: 'event_log', title: 'Scher Remodeling', logKind: 'call', date: '2026-10-14', summary: 'Coming Thursday at 10; quote a week after the visit', ...x })
  it('LOG names the option, the kind and the day, with the summary under it', () => {
    expect(opRow(ev(opt), today)).toEqual({ kind: 'LOG', title: 'Scher Remodeling · Phone call · Today', where: '“Coming Thursday at 10; quote a week after the visit”' })
    expect(opRow(ev({ ...goal, logKind: 'note', date: '2026-10-12', summary: 'Permit filed' }), today)).toEqual({ kind: 'LOG', title: 'Redo the bathrooms · Note · Mon Oct 12', where: '“Permit filed”' })
    expect(opRow(ev({ ...goal, date: '2026-10-13', time: '16:00', summary: '  Left a message  ' }), today)).toEqual({ kind: 'LOG', title: 'Redo the bathrooms · Phone call · Tue Oct 13, 4:00', where: '“Left a message”' })
    expect(opRow(ev({ ...goal, time: '09:30' }), today).title).toBe('Redo the bathrooms · Phone call · Today 9:30')
  })
  it('PLAN names the day and time it goes on the calendar', () => {
    expect(opRow(ev({ ...opt, op: 'event_plan', logKind: 'visit', date: '2026-10-30', time: '10:00' }), today)).toEqual({ kind: 'PLAN', title: 'Scher Remodeling · Home visit · Fri Oct 30, 10:00', where: 'goes on your calendar' })
    expect(opRow(ev({ ...goal, op: 'event_plan', logKind: 'meeting', date: '2026-10-16', time: '14:30' }), today).title).toBe('Redo the bathrooms · Meeting · Fri Oct 16, 2:30')
    expect(opRow(ev({ ...goal, op: 'event_plan', logKind: 'call', date: '2026-10-16' }), today).title).toBe('Redo the bathrooms · Phone call · Fri Oct 16')
  })
  it('sit with the choices: under the goal and choice, or the goal alone', () => {
    for (const kind of ['event_log', 'event_plan'] as const) {
      expect(opScope(ev({ ...opt, op: kind }))).toBe('choice')
      expect(isChoiceOp(ev({ ...goal, op: kind }))).toBe(true)
      expect(choiceHeading(ev({ ...opt, op: kind }))).toBe('Redo the bathrooms · Contractor')
      expect(choiceHeading(ev({ ...goal, op: kind }))).toBe('Redo the bathrooms')
    }
  })
})
