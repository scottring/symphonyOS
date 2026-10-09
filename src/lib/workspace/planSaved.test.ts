import { describe, expect, it } from 'vitest'
import { planSaved } from '../../../supabase/functions/symphony-agent/planSaved'

describe('live planning save events', () => {
  it('reveals each saved milestone immediately with its real identifier and period', () => {
    expect(planSaved('symphony_create_plan_item', {level:'month'}, JSON.stringify({id:'milestone',month_start:'2026-10-01',source_id:'season'}))).toEqual({type:'plan_saved',id:'milestone',level:2,date:'2026-10-01'})
  })
  it('keeps scheduled weekly work in its planning horizon after bucket becomes timed', () => {
    expect(planSaved('symphony_update_task', {}, JSON.stringify({id:'action',bucket:'timed',week_start:'2026-10-12',scheduled_for:'2026-10-14T12:00:00Z'}))).toEqual({type:'plan_saved',id:'action',level:3,date:'2026-10-12'})
  })
  it('reflects linking an existing item without creating another item', () => {
    expect(planSaved('symphony_link_plan_item', {level:'month'}, JSON.stringify({id:'existing',month_start:'2026-10-01',source_id:'parent'}))?.id).toBe('existing')
  })
  it('never signals success for errors, read results or unrecognized records', () => {
    for(const result of ['Error: unavailable','{"error":"denied"}','null','{}']) expect(planSaved('symphony_create_plan_item',{level:'month'},result)).toBeNull()
    expect(planSaved('symphony_list_tasks',{},'{"id":"a","week_start":"2026-10-12"}')).toBeNull()
  })
})
