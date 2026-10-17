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
    { target: 'next', title: 'On to the week', text: 'Opens Week. There, tell Symphony what to do this week for a goal.' },
  ],
  week: [
    { target: 'page-title', title: 'This week', text: 'Week is for doing: this week’s tasks and when they happen.' },
    { target: 'region:The days', title: 'The days', text: 'The picture of the week. Each day shows its events, the kids’ specials, tasks (circles) and routines (rounded squares), who carries each, and the hours with nothing scheduled. Tick a task to finish it, drag it to move it, tap it to open it. Days gone by are dimmed.' },
    { target: 'week-sentence', title: 'The week in a sentence', text: 'One plain sentence about how the week stands.' },
    { target: 'still-to-place', title: 'No day yet', text: 'What is chosen for this week but has no day. Drag one onto a day, or on a phone press + to pick its day.' },
    { target: 'plan-walk', title: 'Help me plan the rest of my week', text: 'Opens a conversation to help you organise your own activities into a plan. The invitation stays visible in the week header, even when chat is closed.' },
  ],
  today: [
    { target: 'page-title', title: 'Today', text: 'Today is for doing: what you are doing today, with what you need to do it.' },
    { target: 'region:The day', title: 'The day', text: 'The day’s hours to scale, with timed things on them and how many hours are still open.' },
    { target: /^region:For (today|this day)$/, title: 'For today', text: 'Things for today without a time. Add task adds one; drag one onto the day to give it a time.' },
    { target: 'this-week', title: 'This week', text: 'This week’s tasks with no day yet. Drag one onto the day, or press +, to plan it for today.' },
    { target: 'region:Coming up', title: 'Coming up', text: 'The next few dated things after today.' },
  ],
  // Inbox, Routines and Meals mark only their masthead and a few sections, so
  // their tours are short; the guide (pageGuides.ts) carries the rest.
  inbox: [
    { target: 'page-title', title: 'Inbox', text: 'What you captured and have not decided about yet. Each row offers Today, This week and Someday; its ⋯ menu has more times, Send to a note or calendar, the Life area and Delete. List and Focus at the foot switch between every row and one at a time; Select acts on several together.' },
    { target: 'region:Needs re-filing', title: 'Needs re-filing', text: 'Captures whose area does not match who can see them. Choose the right area to file each one.' },
    { target: 'region:Waiting on', title: 'Waiting on', text: 'Things you did your part on and are waiting to hear back about.' },
    { target: 'region:Expired', title: 'Expired', text: 'Older unfinished work, folded away until you open it.' },
  ],
  routines: [
    { target: 'page-title', title: 'Routines', text: 'The picture of what your household does again and again, shown as this week’s occurrences. The arrows beside “Our rhythm” step between weeks; Change our routines starts a conversation, New routine writes one in plain words.' },
    { target: 'rhythm-sentence', title: 'The week in a sentence', text: 'One plain sentence about how the rhythm stands this week.' },
    { target: 'region:Every day', title: 'Every day', text: 'The routines that happen daily. Tap one to open it.' },
    { target: 'region:The week', title: 'The week', text: 'A column per day and a band per time of day (Morning, Afternoon, Evening, Any time), each cell listing that day’s occurrences with their time and who carries them. Tap one to open it, or drag it onto another day.' },
    { target: 'region:No day yet', title: 'No day yet', text: 'Routines with no day chosen yet.' },
  ],
  meals: [
    { target: 'page-title', title: 'Meals', text: 'A week of eating and the recipes you cook; Plan and Recipes switch between them. On Plan, each day has a Breakfast, Lunch and Dinner slot to fill from a recipe, a typed name or last night’s leftovers; Build shopping list gathers the week’s ingredients. On Recipes, + adds one and the filters narrow the shelf.' },
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
