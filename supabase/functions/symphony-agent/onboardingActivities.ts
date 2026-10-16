import { changeSetFromInput, PROPOSE_CHANGES_TOOL } from './changeSet.ts'
import { realDate } from './readPlan.ts'

export const ACTIVITY_TOOLS = new Set(['symphony_list_household_members','symphony_list_tasks','symphony_read_week','symphony_read_plan','symphony_list_routines','symphony_propose_changes'])
export const ACTIVITY_PROMPT = `First activities and goals during Getting started. These rules override the general planning scripts.
- You are Symphony. Invite the person's story and help give their own intentions a place. They can describe several tasks, ideas and goals together; never make them classify records, fill fields or select a horizon from a menu. Never invent goals, activities or a complete plan. Reply in one or two natural sentences, with at most one useful question.
- This conversation only drafts NEW activities and goals. Read existing tasks and relevant plans before proposing, to avoid duplicates. Existing items are left intact; explain when something is already captured. Recurring patterns belong to the routines conversation, not duplicate one-off tasks.
- A concrete task or idea with no chosen timing goes to Inbox (placement inbox). Do not force a date. "This week" goes to placement week with the week_start returned by symphony_read_week. A chosen day goes to placement day with date and an exact time only if stated; preserve cues such as "after lunch" in note, without inventing a clock time. These choices are per item: an undated idea must stay in Inbox even when another item belongs this week.
- Broader intentions use plan_add only when the person has chosen a year, quarter/season or month. Use symphony_read_plan for its actual period_start. If the horizon is unclear, ask one short natural question about when they want to give it attention. Do not silently demote a stated goal to a task. A goal can stand alone; do not generate its supporting tasks.
- Use existing goal IDs only for relationships (parent_id for goals, goal_id for an activity supporting a month goal). If both a new parent and its child are requested, first offer the parent for saving, then read it before drafting the linked child. Do not pretend to link unsaved goals or silently save requested relationships as unrelated items.
- Default context personal. Only use family or work when explicitly requested. Assign only a known household member when explicitly requested; a person mentioned in a task title is not automatically its assignee.
- Always use symphony_propose_changes, even for one item. Its card replaces the prior draft: keep every still-pending item and all its timing, notes, audience and relationships through corrections. A correction edits this draft, never adds a second copy. The supplied pending card states the actual destinations. If it was approved, those items are already saved; do not propose them again.
- No tool here writes plans. Only the visible Save button does. A typed "yes" or "save" does not save; direct the person to the button. Never claim a save, a completed setup, or that the week is planned. The draft itself shows the detail; do not repeat the list or repeatedly ask "anything else?".`

// This schema is offered only on the activity introduction. General planning
// keeps its existing tool contract and applier.
export const ACTIVITY_PROPOSE_TOOL = {
  name:PROPOSE_CHANGES_TOOL.name,
  description:'Prepare the whole revised onboarding draft, with only new activities (add) and goals (plan_add). No records are written. Each activity has its own placement. Preserve all still-pending items on corrections.',
  input_schema:{type:'object',properties:{title:{type:'string'},ops:{type:'array',maxItems:30,items:{type:'object',properties:{
    op:{type:'string',enum:['add','plan_add']}, title:{type:'string'},
    placement:{type:'string',enum:['inbox','week','day'],description:'Required for add. Inbox without chosen timing; week for an undated activity chosen for a week; day when the person named a date.'},
    week_start:{type:'string',description:'For placement week: actual YYYY-MM-DD week start from read_week.'},
    date:{type:'string',description:'For placement day: chosen local YYYY-MM-DD.'},time:{type:'string',description:'Exact stated HH:MM, only with a date.'},
    note:{type:'string',description:'Preserve the person’s useful details and flexible timing, up to 1000 characters.'},
    context:{type:'string',enum:['personal','family','work']},assignee:{type:'string',description:'Known member ID, only for an explicitly assigned activity.'},
    goal_id:{type:'string',description:'Existing month goal this activity supports.'},
    level:{type:'string',enum:['year','season','month']},period_start:{type:'string'},parent_id:{type:'string',description:'Existing parent goal only.'},
  },required:['op','title']}}},required:['ops']},
}

export function activitySetFromInput(input:Record<string,unknown>,key:string) {
  const raw=input.ops
  if(!Array.isArray(raw)||raw.some(op=>!op||!['add','plan_add'].includes(op.op)))return {error:'Getting started accepts only new activities (add) and goals (plan_add). Existing items and routines stay unchanged.'}
  const parsed=changeSetFromInput(input,key)
  if('error' in parsed)return parsed
  for(let i=0;i<raw.length;i++) {
    const source=raw[i],op=parsed.set.ops[i]
    if(source.note!==undefined) {
      if(typeof source.note!=='string'||source.note.length>1000)return {error:'Keep each note within 1000 characters.'}
      op.note=source.note.trim()
    }
    if(source.context!==undefined&&!['personal','family','work'].includes(source.context))return {error:'Unknown life area.'}
    op.context=source.context??'personal'
    if(op.op==='plan_add') {
      if(['placement','week_start','date','time','assignee','goal_id'].some(k=>source[k]!==undefined))return {error:'A goal belongs to its planning horizon; do not schedule or assign it as an activity.'}
      continue
    }
    if(['level','period_start','parent_id'].some(k=>source[k]!==undefined))return {error:'An activity connects to a month goal through goal_id; it does not have a goal planning period.'}
    if(!['inbox','week','day'].includes(source.placement))return {error:'Each activity needs placement inbox, week or day.'}
    if(source.placement==='day'?!op.date:source.date!==undefined||source.time!==undefined)return {error:'Only a day placement takes a date and optional exact time.'}
    if(source.placement==='week'?!realDate(source.week_start):source.week_start!==undefined)return {error:'Only a week placement takes a valid week_start.'}
    op.capturePlacement=source.placement
    if(source.placement==='week')op.captureWeekStart=source.week_start
  }
  return parsed
}
