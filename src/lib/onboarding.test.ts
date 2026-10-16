import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => {
  const rows: Record<string,Record<string,unknown>[]> = {}
  const faults: {table:string;op:string;after?:boolean}[] = []
  const writes: {table:string;row:Record<string,unknown>}[] = []
  const from = (table:string) => {
    let op='select', payload:Record<string,unknown>|undefined, single=false
    const filters: [string,unknown][]=[]
    const b:Record<string,unknown>={}
    for (const key of ['select','order','limit']) b[key]=()=>b
    b.eq=(k:string,v:unknown)=>{filters.push([k,v]);return b}
    b.is=(k:string,v:unknown)=>{filters.push([k,v]);return b}
    for (const key of ['insert','upsert','update']) b[key]=(v:Record<string,unknown>)=>{op=key;payload=v;return b}
    for (const key of ['single','maybeSingle']) b[key]=()=>{single=true;return b}
    b.then=(resolve:(v:unknown)=>void)=>{
      const fi=faults.findIndex(f=>f.table===table&&f.op===op)
      const fault=fi<0?null:faults.splice(fi,1)[0]
      if (fault&&!fault.after) return resolve({data:null,error:{message:'Connection failed'}})
      rows[table]??=[]
      let found=rows[table].filter(r=>filters.every(([k,v])=>(r[k]??null)===v))
      if (payload) {
        writes.push({table,row:{...payload}})
        const existing=op==='upsert'?rows[table].find(r=>r.user_id===payload!.user_id):op==='update'?found[0]:null
        if (existing) Object.assign(existing,payload)
        else if(op!=='update') rows[table].push({...payload})
        found=existing?[existing]:op==='update'?[]:[rows[table].at(-1)!]
      }
      resolve(fault?{data:null,error:{message:'Lost acknowledgement'}}:{data:single?found[0]??null:found,error:null,count:found.length})
    }
    return b
  }
  return {rows,faults,writes,from,rpc:vi.fn().mockResolvedValue({data:'hh',error:null})}
})
vi.mock('./supabase',()=>({supabase:{from:db.from,rpc:db.rpc}}))
vi.mock('@/hooks/useWeather',()=>({setHomeCoords:vi.fn()}))
import { loadOnboarding, onboardingId, saveOnboardingItem, saveOnboardingProgress, saveOnboardingRoutine, saveOnboardingWeekStart, type SetupContext } from './onboarding'
import { readCadenceConfig } from './cadence/config'
import { newOnboardingProgress, decodeOnboardingProgress, encodeOnboardingProgress, onboardingOpenLabel } from './onboardingProgress'
import { needsFirstRun, saveFirstRunSetup } from './firstRun'
import { isRoutineStoryDraft, saveRoutineStory } from './onboardingStory'
import type { ChangeSet } from './canvas/changeCard'
import { changeSetFromInput } from '../../supabase/functions/symphony-agent/changeSet'
import { resolveRoutine } from './routineUtils'
import { createMockRoutine } from '@/test/mocks/factories'
import { saveActivityStory, isActivityStoryDraft } from './activityStory'
const context:SetupContext={household:{id:'hh',name:'Test',owner_id:'u1',week_starts_on:1,seasons:null},members:[],routines:[],progress:newOnboardingProgress(),established:false}
describe('activity story writes',()=>{
  const story:ChangeSet={key:'first',title:'My intentions',ops:[
    {key:'a',op:'add',title:'Idea',capturePlacement:'inbox',note:'White bench'},
    {key:'b',op:'add',title:'Bike',capturePlacement:'week',captureWeekStart:'2026-10-12'},
    {key:'c',op:'add',title:'Shower',capturePlacement:'day',date:'2026-10-16',time:'15:00'},
    {key:'d',op:'plan_add',title:'Learn to swim',level:'year',periodStart:'2027-01-01'},
  ]}
  it('saves per-item timing and a standalone goal, and repeated saves do not duplicate',async()=>{
    const receipts=await saveActivityStory('u1',story,context)
    await saveActivityStory('u1',story,context)
    expect(db.rows.tasks).toHaveLength(3);expect(db.rows.goals).toHaveLength(1)
    expect(db.rows.tasks[0]).toMatchObject({bucket:'inbox',scheduled_for:null,week_start:null,notes:'White bench',scope:'individual'})
    expect(db.rows.tasks[1]).toMatchObject({bucket:'week',week_start:'2026-10-12',scheduled_for:null})
    expect(new Date(String(db.rows.tasks[2].scheduled_for)).getHours()).toBe(15)
    expect(db.rows.goals[0]).toMatchObject({name:'Learn to swim',year:2027})
    expect(receipts.map(r=>r.destination)).toEqual(['inbox','week','today','year'])
  })
  it('retries after a partial save and never overwrites an intervening edit',async()=>{
    db.faults.push({table:'goals',op:'insert'})
    await expect(saveActivityStory('u1',story,context)).rejects.toThrow('confirm')
    db.rows.tasks[0].title='Changed on another device'
    const receipts=await saveActivityStory('u1',story,context)
    expect(db.rows.tasks).toHaveLength(3);expect(db.rows.goals).toHaveLength(1)
    expect(receipts[0].title).toBe('Changed on another device')
  })
  it('checks every assignee and parent before any save',async()=>{
    await expect(saveActivityStory('u1',{...story,ops:[story.ops[0],{...story.ops[1],assignee:'stranger'}]},context)).rejects.toThrow('person')
    expect(db.writes).toHaveLength(0)
    await expect(saveActivityStory('u1',{...story,ops:[story.ops[0],{...story.ops[1],goalId:'private-or-missing'}]},context)).rejects.toThrow('goal')
    expect(db.writes).toHaveLength(0)
  })
  it('keeps monthly and seasonal goals in their own periods with readable saved receipts',async()=>{
    const result=await saveActivityStory('u1',{key:'horizons',title:'Art goals',ops:[
      {key:'m',op:'plan_add',title:'Learn three techniques',level:'month',periodStart:'2026-10-01'},
      {key:'s',op:'plan_add',title:'Make room for art',level:'season',periodStart:'2026-09-01'},
    ]},context)
    expect(db.rows.tasks[0]).toMatchObject({bucket:'month',is_goal:true,month_start:'2026-10-01',season_start:null,scope:'individual'})
    expect(db.rows.tasks[1]).toMatchObject({bucket:'quarter',is_goal:true,season_start:'2026-09-01',month_start:null,scope:'individual'})
    expect(result.map(r=>r.where)).toEqual(['Month · October 2026','Quarter · Fall 2026'])
  })
  it('links only the correct existing rung without widening its audience',async()=>{
    db.rows.tasks=[{id:'monthly',title:'Month goal',is_goal:true,bucket:'month',context:'personal',goal_id:'year-goal'}]
    await saveActivityStory('u1',{key:'linked',title:'Supporting activity',ops:[{...story.ops[0],goalId:'monthly'}]},context)
    expect(db.rows.tasks[1]).toMatchObject({source_id:'monthly',goal_id:'year-goal',scope:'individual'})
    await expect(saveActivityStory('u1',{key:'bad',title:'Wrong audience',ops:[{...story.ops[0],goalId:'monthly',context:'family'}]},context)).rejects.toThrow('life area')
    expect(db.rows.tasks).toHaveLength(2)
  })
  it('rejects forged restored drafts and impossible dates',()=>{
    expect(isActivityStoryDraft({...story,ops:[{...story.ops[0],op:'done'}]})).toBe(false)
    expect(isActivityStoryDraft({...story,ops:[{...story.ops[2],date:'2026-02-30'}]})).toBe(false)
  })
})
beforeEach(()=>{for(const k of Object.keys(db.rows)) delete db.rows[k];db.faults.length=0;db.writes.length=0;db.rpc.mockReset();db.rpc.mockResolvedValue({data:'hh',error:null});localStorage.clear()})
describe('confirmed onboarding progress',()=>{
  it('names the actual future destination and reads older progress without a device step',()=>{
    expect(onboardingOpenLabel({...newOnboardingProgress(),destination:'year',destinationStart:'2027-01-01'})).toBe('Open 2027')
    expect(onboardingOpenLabel({...newOnboardingProgress(),destination:'today',destinationStart:'2026-10-19'})).toContain('Monday')
    expect(decodeOnboardingProgress(encodeOnboardingProgress(newOnboardingProgress()))).toEqual(newOnboardingProgress())
  })
  it('round-trips explicit deferral and resumes even after the first task exists',()=>{
    const p={...newOnboardingProgress(),step:'horizons' as const,household:'done' as const,routines:'later' as const}
    expect(decodeOnboardingProgress(encodeOnboardingProgress(p))).toEqual(p)
    expect(needsFirstRun({completed:false,hasTasks:true,memberCount:3,onboardingStep:encodeOnboardingProgress(p)})).toBe(true)
    expect(needsFirstRun({completed:false,hasTasks:true,memberCount:3,onboardingStep:encodeOnboardingProgress({...p,paused:true})})).toBe(false)
    expect(decodeOnboardingProgress('welcome')).toBeNull()
    expect(decodeOnboardingProgress('getting-started:v1:{}')).toBeNull()
  })
  it('will not finish without household, horizon awareness and explicit choices',async()=>{
    await expect(saveOnboardingProgress('u1',{...newOnboardingProgress(),finished:true})).rejects.toThrow('Review each')
    expect(db.writes).toHaveLength(0)
    const p={...newOnboardingProgress(),household:'done' as const,routines:'later' as const,activity:'later' as const,horizonsSeen:true,finished:true}
    await saveOnboardingProgress('u1',p)
    expect(db.rows.user_profiles[0].onboarding_completed_at).toEqual(expect.any(String))
    expect(decodeOnboardingProgress(db.rows.user_profiles[0].onboarding_step)?.routines).toBe('later')
  })
  it('reports progress and loading failures without treating them as completion or emptiness',async()=>{
    db.faults.push({table:'user_profiles',op:'upsert'})
    await expect(saveOnboardingProgress('u1',newOnboardingProgress())).rejects.toThrow('Connection failed')
    db.faults.push({table:'routines',op:'select'})
    await expect(loadOnboarding('u1')).rejects.toThrow('Connection failed')
  })
})
describe('onboarding creates and retry',()=>{
  it('uses different stable identifiers for people and accounts',async()=>{
    expect(await onboardingId('u1','routine')).toBe(await onboardingId('u1','routine'))
    expect(await onboardingId('u1','routine')).not.toBe(await onboardingId('u2','routine'))
    expect(await onboardingId('u1','person:0')).not.toBe(await onboardingId('u1','person:1'))
  })
  it('keeps exact recurring days, time, assignees and shared visibility on a lost acknowledgement',async()=>{
    const input={name:'School pickup',recurrence:{type:'weekly' as const,days:['Monday','thu']},time:'15:00',assignees:['sam'],context:'family' as const}
    db.faults.push({table:'routines',op:'insert',after:true})
    const saved=await saveOnboardingRoutine('u1',input)
    await saveOnboardingRoutine('u1',input)
    expect(db.rows.routines).toHaveLength(1)
    expect(saved).toMatchObject({recurrence_pattern:{type:'weekly',days:['mon','thu']},time_of_day:'15:00',assigned_to:'sam',assigned_to_all:['sam'],scope:'compound'})
  })
  it('a personal routine assigned to self stays private',async()=>{
    await saveOnboardingRoutine('u1',{name:'Read',recurrence:{type:'daily'},time:'',assignees:['me'],context:'personal'},[{id:'me',name:'Me',user_id:'u1',auth_user_id:null,is_full_user:true}])
    expect(db.rows.routines[0].scope).toBe('individual')
  })
  it('never overwrites a routine edited after the original save',async()=>{
    const input={name:'Walk',recurrence:{type:'daily' as const},time:'',assignees:[],context:'family' as const}
    await saveOnboardingRoutine('u1',input)
    db.rows.routines[0].name='Evening walk'
    expect((await saveOnboardingRoutine('u1',input)).name).toBe('Evening walk')
    expect(db.rows.routines).toHaveLength(1)
  })
  it('captures an undated personal item without manufacturing a schedule',async()=>{
    const r=await saveOnboardingItem('u1','Buy a bench','inbox',context)
    expect(r.destination).toBe('inbox')
    expect(db.rows.tasks[0]).toMatchObject({bucket:'inbox',scheduled_for:null,week_start:null,month_start:null,season_start:null,is_goal:false,scope:'individual'})
  })
  it('uses the household week start and local dates for week placement',async()=>{
    await saveOnboardingItem('u1','Library books','week',context,new Date(2026,9,15,16))
    expect(db.rows.tasks[0]).toMatchObject({week_start:'2026-10-12',scheduled_for:null,bucket:'week'})
  })
  it.each(['month','season','year'] as const)('preserves a %s goal as a goal in its chosen horizon',async place=>{
    await saveOnboardingItem('u1','Make time for family',place,context,new Date(2026,9,15))
    if(place==='year') expect(db.rows.goals[0]).toMatchObject({name:'Make time for family',year:2026})
    else expect(db.rows.tasks[0]).toMatchObject({is_goal:true,bucket:place==='month'?'month':'quarter',scheduled_for:null,[place==='month'?'month_start':'season_start']:place==='month'?'2026-10-01':'2026-09-01'})
  })
  it('returns the original first item when a retry changes the destination',async()=>{
    await saveOnboardingItem('u1','Read more','year',context)
    const result=await saveOnboardingItem('u1','Read more','inbox',context)
    expect(result.destination).toBe('year')
    expect(db.rows.goals).toHaveLength(1);expect(db.rows.tasks??[]).toHaveLength(0)
  })
})
describe('household setup failures',()=>{
  const form={householdName:'Rivera',yourName:'Jess',others:[{name:'Sam',role:'parent' as const}],home:null}
  it('saves the chosen household week through the existing transaction before completing setup',async()=>{
    db.rpc.mockImplementation(async(name:string)=>({data:name==='setup_household'?'hh':0,error:null}))
    await saveFirstRunSetup('u1',{...form,weekStartsOn:6})
    expect(db.rpc.mock.calls).toEqual([['setup_household',{p_name:'Rivera'}],['set_household_week_start',{p_start:6}]])
    expect(readCadenceConfig().weekStartsOn).toBe(6)
    expect(db.rows.family_members).toHaveLength(2)
  })
  it('holds setup and the local week unchanged if the household week save fails, then retries safely',async()=>{
    db.rpc.mockResolvedValueOnce({data:'hh',error:null}).mockResolvedValueOnce({data:null,error:{message:'Week unavailable'}})
    await expect(saveFirstRunSetup('u1',{...form,weekStartsOn:6})).rejects.toThrow('Week unavailable')
    expect(readCadenceConfig().weekStartsOn).toBe(0)
    expect(db.rows.family_members??[]).toHaveLength(0)
    db.rpc.mockImplementation(async(name:string)=>({data:name==='setup_household'?'hh':0,error:null}))
    await saveFirstRunSetup('u1',{...form,weekStartsOn:6})
    expect(readCadenceConfig().weekStartsOn).toBe(6)
    expect(db.rows.family_members).toHaveLength(2)
  })
  it('does not claim a week start without a valid choice and confirmed transaction response',async()=>{
    await expect(saveOnboardingWeekStart(3 as 6)).rejects.toThrow('Choose')
    expect(db.rpc).not.toHaveBeenCalled()
    db.rpc.mockResolvedValueOnce({data:null,error:null})
    await expect(saveOnboardingWeekStart(6)).rejects.toThrow('confirmed')
    expect(readCadenceConfig().weekStartsOn).toBe(0)
  })
  it('does not advance or stamp completion when the household fails',async()=>{
    db.rpc.mockResolvedValue({data:null,error:{message:'Household unavailable'}})
    await expect(saveFirstRunSetup('u1',form)).rejects.toThrow('Household unavailable')
    expect(db.writes.map(w=>w.table)).toEqual(['user_profiles'])
    expect(db.rows.user_profiles[0].onboarding_completed_at).toBeUndefined()
    expect(decodeOnboardingProgress(db.rows.user_profiles[0].onboarding_step)?.household).toBe('pending')
  })
  it('reuses confirmed member rows after a partial save',async()=>{
    await saveFirstRunSetup('u1',form)
    await saveFirstRunSetup('u1',form)
    expect(db.rows.family_members).toHaveLength(2)
    expect(db.rows.user_profiles[0].onboarding_completed_at).toBeUndefined()
    expect(needsFirstRun({completed:false,hasTasks:false,memberCount:2,onboardingStep:String(db.rows.user_profiles[0].onboarding_step)})).toBe(true)
  })
  it('does not create household records when the resume marker cannot be saved',async()=>{
    db.faults.push({table:'user_profiles',op:'upsert'})
    await expect(saveFirstRunSetup('u1',form)).rejects.toThrow('Connection failed')
    expect(db.rpc).not.toHaveBeenCalled()
    expect(db.writes).toHaveLength(0)
  })
})

describe('approved routines extracted from a story',()=>{
  const card:ChangeSet={key:'story-card',title:'Your routines',ops:[
    {key:'walk',op:'routine_add',title:'Walk the dog',days:['tue','thu'],time:'07:30',context:'family'},
    {key:'bins',op:'routine_add',title:'Put out the bins',days:['sun'],context:'family',note:'Sunday evening, whenever he gets home'},
  ]}
  it('saves every routine with exact days and retains an unspecified time',async()=>{
    await saveRoutineStory('u1',card,[])
    await saveRoutineStory('u1',card,[])
    expect(db.rows.routines).toHaveLength(2)
    expect(db.rows.routines[0]).toMatchObject({name:'Walk the dog',recurrence_pattern:{type:'weekly',days:['tue','thu']},time_of_day:'07:30'})
    expect(db.rows.routines[1]).toMatchObject({name:'Put out the bins',time_of_day:null,description:'Sunday evening, whenever he gets home'})
  })
  it('resumes an interrupted batch without duplicating its already saved routine',async()=>{
    await saveOnboardingRoutine('u1',{name:'Walk the dog',recurrence:{type:'weekly',days:['tue','thu']},time:'07:30',assignees:[],context:'family'},[],'story:story-card:walk')
    db.faults.push({table:'routines',op:'insert'})
    await expect(saveRoutineStory('u1',card,[])).rejects.toThrow('could not confirm')
    expect(db.rows.routines).toHaveLength(1)
    await saveRoutineStory('u1',card,[])
    expect(db.rows.routines).toHaveLength(2)
  })
  it('refuses unsupported or untrusted drafts before any record is written',async()=>{
    for(const broken of [
      {...card,ops:[{...card.ops[0],op:'add'}]},
      {...card,ops:[{...card.ops[0],time:'25:70'}]},
      {...card,ops:[{...card.ops[0],days:undefined}]},
      {...card,ops:[card.ops[0],card.ops[0]]},
    ]) expect(isRoutineStoryDraft(broken)).toBe(false)
    await expect(saveRoutineStory('u1',{...card,ops:[{...card.ops[0],assignees:['unknown-person']}]},[])).rejects.toThrow('needs another look')
    expect(db.writes).toHaveLength(0)
  })
  it('carries flexible weekly timing through the actual server-to-client proposal contract',async()=>{
    const parsed=changeSetFromInput({title:'Your week',ops:[{op:'routine_add',name:'Laundry',days:[],note:'Once a week, when the basket is full'}]},'flexible')
    expect(parsed).not.toHaveProperty('error')
    if('error' in parsed) throw new Error(parsed.error)
    expect(isRoutineStoryDraft(parsed.set)).toBe(true)
    await saveRoutineStory('u1',parsed.set,[])
    expect(db.rows.routines[0]).toMatchObject({recurrence_pattern:{type:'weekly',days:[]},time_of_day:null,description:'Once a week, when the basket is full'})
  })
  it('preserves display choices through parsing, save, retry, reload and the view resolver',async()=>{
    const parsed=changeSetFromInput({title:'Your routines',ops:[
      {op:'routine_add',name:'Vitamins',days:['thu'],show_on_timeline:false},
      {op:'routine_add',name:'Walk',days:['thu'],show_on_timeline:true},
      {op:'routine_add',name:'Bins',days:['thu']},
    ]},'display-story')
    if('error' in parsed) throw new Error(parsed.error)
    expect(isRoutineStoryDraft(parsed.set)).toBe(true)
    db.faults.push({table:'routines',op:'insert',after:true})
    await saveRoutineStory('u1',parsed.set,[])
    await saveRoutineStory('u1',parsed.set,[])
    expect(db.rows.routines).toHaveLength(3)
    const reloaded=await loadOnboarding('u1')
    expect(reloaded.routines.map(r=>r.show_on_timeline)).toEqual([false,true,true])
    for(const row of db.rows.routines) {
      expect(row.visibility).toBe('active')
      expect(row.scope).toBe('compound')
      for(const date of [new Date(2026,9,15),null]) {
        const visible=resolveRoutine(createMockRoutine(row),{date,member:null,prefs:{hideRoutines:false,layers:new Set(['family'])}})
        expect(visible.shows).toBe(row.show_on_timeline)
      }
    }
    expect(isRoutineStoryDraft({...parsed.set,ops:[{...parsed.set.ops[0],showOnTimeline:'false'}]})).toBe(false)
  })
  it('changes an existing routine’s display once, preserving its rhythm and retrying a lost acknowledgement',async()=>{
    const original={id:'existing',user_id:'u1',name:'Walk',updated_at:'2026-10-15T15:00:00Z',visibility:'active',show_on_timeline:true,recurrence_pattern:{type:'weekly',days:['tue','thu']},scope:'compound'}
    db.rows.routines=[{...original}]
    const choice:ChangeSet={key:'display',title:'Display choices',ops:[{key:'hide',op:'routine_change',title:'Walk',routineId:'existing',seen:original.updated_at,showOnTimeline:false}]}
    db.faults.push({table:'routines',op:'update',after:true})
    await saveRoutineStory('u1',choice,[])
    await saveRoutineStory('u1',choice,[])
    expect(db.rows.routines).toEqual([{...original,show_on_timeline:false}])
    expect(db.writes).toEqual([{table:'routines',row:{show_on_timeline:false}}])
    await saveRoutineStory('u1',{...choice,ops:[{...choice.ops[0],showOnTimeline:true}]},[])
    expect(db.rows.routines).toEqual([original])
  })
  it('refuses stale display edits and unsupported edits without writing',async()=>{
    db.rows.routines=[{id:'existing',updated_at:'newer',show_on_timeline:true}]
    const choice:ChangeSet={key:'display',title:'Display choices',ops:[{key:'hide',op:'routine_change',title:'Walk',routineId:'existing',seen:'older',showOnTimeline:false}]}
    await expect(saveRoutineStory('u1',choice,[])).rejects.toThrow('changed while you were reviewing')
    for(const patch of [{time:'07:30'},{days:['tue']},{assignees:['sam']},{seen:undefined},{showOnTimeline:undefined}]) {
      expect(isRoutineStoryDraft({...choice,ops:[{...choice.ops[0],...patch}]})).toBe(false)
    }
    expect(db.writes).toHaveLength(0)
  })
})
