// src/lib/explain/pageTours.ts
//
// "What is this page?": the page's own tour, written here beside the pages.
// Each note is about one marked part and is shown only when that part is on
// screen, so a note can never land on something else. (Symphony wrote these
// tours until 2026-10-13; twice a note described a part that was not on
// screen and pointed at whatever was nearest — Scott chose page-written
// tours.) Questions typed or spoken to Symphony still get its own answers.

import type { ShowStep } from './steps'
import { findTarget, findTargetMatching } from './targets'
import { guideKey } from './pageGuides'

export interface TourPart {
  /** A target id ("period", "region:Inbox"), or a pattern for a region named by what it says. */
  target: string | RegExp
  title: string
  text: string
}

const PLAN_LIST_HINT = 'Point at a row for Done, Someday or Delete; its ⋯ menu has the rest.'

export const PAGE_TOURS: Record<string, TourPart[]> = {
  year: [
    { target: 'period', title: 'This year', text: 'Year is reference: the few goals you want this year to hold. A list for looking, not doing.' },
    { target: 'above', title: 'Last year, for reference', text: 'Last year’s goals, folded to one line. Show opens them.' },
    { target: 'list', title: 'This year’s goals', text: 'One row per year goal. A goal with a season goal under it names it (“Fall: …”). + Add a goal at the foot writes one. Point at a row for Done or Delete.' },
    { target: 'next', title: 'On to the season', text: 'Goes on to the season, the brainstorm list for this stretch of the year.' },
  ],
  season: [
    { target: 'period', title: 'This season', text: 'A brainstorm list for this stretch of the year: what you would like it to hold. Nothing here is on a calendar. The arrows beside the title step to the previous or next season.' },
    { target: 'above', title: 'The year, for reference', text: 'This year’s goals, folded to one line. Show opens them.' },
    { target: 'list', title: 'Every season goal', text: `One list, drawn one way. A goal written for a year goal says “For …” under it. + Add a goal at the foot writes one, with an optional “For”. ${PLAN_LIST_HINT}` },
    { target: 'next', title: 'On to the month', text: 'Goes on to the month, where you choose what this month holds.' },
  ],
  month: [
    { target: 'period', title: 'This month', text: 'One question: what do you want to accomplish this month? Nothing here is on a calendar yet.' },
    { target: 'above', title: 'The season, for reference', text: 'The season’s goals, folded to one line. Show opens them; nothing on it has to come down.' },
    { target: 'list', title: 'Every month goal', text: `One list, drawn one way. A goal written for a season goal says “For …” under it; one with tasks this week names them. + Add a goal at the foot writes one. ${PLAN_LIST_HINT}` },
    { target: 'next', title: 'On to the week', text: 'Goes on to Week, where month goals become this week’s tasks.' },
  ],
  week: [
    { target: 'page-title', title: 'This week', text: 'Week is for doing: this week’s tasks and when they happen. Days and Hours, at the right, switch how the days are drawn.' },
    { target: 'still-to-place', title: 'Still to place', text: 'What is chosen for this week but has no day yet. Show opens it above the days.' },
    { target: 'region:Still to place', title: 'The shelf', text: 'Tasks sit under the month goal they serve. Drag one onto a day, or press + to give it a day.' },
    { target: 'region:Routines to place', title: 'Routines to place', text: 'Repeating things that still need a day this week.' },
    { target: 'region:The days', title: 'The days', text: 'Each day shows its events, the kids’ specials, tasks (circles) and routines (rounded squares), who carries each, and the hours with nothing scheduled. Days gone by are dimmed.' },
    { target: 'plan-button', title: 'Plan the week', text: 'Opens the planning session: last week, the Inbox, the calendar and routines, then writing the week.' },
  ],
  today: [
    { target: 'page-title', title: 'Today', text: 'Today is for doing: what you are doing today, with what you need to do it.' },
    { target: 'region:The day', title: 'The day', text: 'The day’s hours to scale, with timed things on them and how many hours are still open.' },
    { target: /^region:For (today|this day)$/, title: 'For today', text: 'Things for today without a time. Add task adds one; drag one onto the day to give it a time.' },
    { target: 'this-week', title: 'This week', text: 'This week’s tasks with no day yet. Drag one onto the day, or press +, to plan it for today.' },
    { target: 'region:Coming up', title: 'Coming up', text: 'The next few dated things after today.' },
  ],
  // Week's planning session: the bar, then the parts of the step on screen.
  'week-plan': [
    { target: 'plan-steps', title: 'Planning, one step at a time', text: 'The steps run left to right; the current one is marked, and the line under them says what it is for. Next goes on, Back or a step’s name goes back, and Leave for now keeps your place.' },
  ],
  'week-plan:lookback': [
    { target: 'close-out', title: 'Last week', text: 'One thing left open at a time: carry it on, mark it done, keep it for someday, or let it go. Nothing is deleted.' },
  ],
  'week-plan:inbox': [
    { target: 'region:Inbox', title: 'Inbox', text: 'What you captured and have not sorted yet. Send each to this week, keep it for someday, or mark it done.' },
    { target: 'region:Your week so far', title: 'Your week so far', text: 'The week filling up as you go.' },
  ],
  'week-plan:between': [
    { target: 'region:Waiting on', title: 'Waiting on', text: 'What you are waiting on from someone else.' },
    { target: 'region:To discuss', title: 'To discuss', text: 'What to talk through together.' },
    { target: 'region:Your week so far', title: 'Your week so far', text: 'The week filling up as you go.' },
  ],
  'week-plan:fixed': [
    { target: 'region:The days', title: 'What can’t move', text: 'Only what is on the calendar: appointments and events. Add anything missing to the calendar, then plan around it.' },
    { target: 'region:Across these days', title: 'Across several days', text: 'Something that spans several days is one bar over them.' },
  ],
  'week-plan:ahead': [
    { target: 'region:Look ahead', title: 'Look ahead', text: 'The next three weeks. Start this week puts anything that needs a head start on this week.' },
    { target: 'region:Your week so far', title: 'Your week so far', text: 'The week filling up as you go.' },
  ],
  'week-plan:routines': [
    { target: /^region:(At a set time|On a set day|Sometime this weekend|Any day this week|Every day|Less often)$/, title: 'Routines, one kind at a time', text: 'Grouped by how they repeat. Where one needs a day this week, choose it; the rest ask nothing.' },
    { target: 'region:Your week so far', title: 'Your week so far', text: 'The week filling up as you go.' },
  ],
  'week-plan:write': [
    { target: 'plan-view', title: 'Lists or Open journal', text: 'Two layouts of the same week: Lists, or Open journal, with each month goal on the left and this week’s tasks for it on the right.' },
    { target: /^region:This week, by .+ goal$/, title: 'This week, by month goal', text: 'Under each month goal, add the tasks you mean to do this week, or put the goal on the week as is. A goal can have none this week; that is fine.' },
    { target: /^region:Not tied to an? .+ goal$/, title: 'Everything else', text: 'This week’s tasks that do not serve a month goal.' },
    { target: /^region:.+, for reference$/, title: 'The month, for reference', text: 'The month’s goals beside you while you write. Nothing on it has to come down.' },
  ],
  'week-plan:plan': [
    { target: 'region:Show whose week', title: 'Whose week', text: 'Everyone’s week, or one person’s share of it.' },
    { target: 'region:The days', title: 'The week’s shape', text: 'Each day’s shape and who carries what. When it looks right, Mark week … planned, at the top, saves the plan.' },
  ],
}

/** The tour key(s) for what is on screen: the page's own, or the mode it is in. */
function tourKeys(page: string, root?: ParentNode): string[] {
  const key = guideKey(page, root)
  const step = (root ?? document).querySelector?.('[data-explain-guide]')?.getAttribute('data-explain-step')
  return step ? [key, `${key}:${step}`] : [key]
}

/** The page's tour: only the parts on screen now, each at most once. */
export function tourFor(page: string, root?: ParentNode): ShowStep[] {
  const seen = new Set<Element>()
  const out: ShowStep[] = []
  for (const part of tourKeys(page, root).flatMap((k) => PAGE_TOURS[k] ?? [])) {
    const hit = typeof part.target === 'string'
      ? (() => { const el = findTarget(part.target, root); return el ? { id: part.target, el } : null })()
      : findTargetMatching(part.target, root)
    if (!hit || seen.has(hit.el)) continue
    seen.add(hit.el)
    out.push({ targets: [hit.id], title: part.title, text: part.text })
  }
  return out
}
