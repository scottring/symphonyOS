// src/lib/explain/pageGuides.ts
//
// What each page is for and what its parts do, in plain words, so Symphony
// can explain the page it is showing. Written here, beside the pages, so a
// change to a page changes its guide in the same commit. The conversation
// adds the person's own items and counts from the page snapshot.

import type { WorkspaceContext } from '@/lib/workspace/context'
import { collectTargets } from './targets'

export const PAGE_GUIDES: Record<string, string> = {
  year:
    'Year is reference: the few goals you want this year to hold, a list for looking, not doing. ' +
    'Each row is a year goal; the count beside it is how many season goals sit under it. ' +
    '+ Add writes a new one. The horizon switch (Year, Season, Month, Week) moves down a level; Next: Season goes on to this season.',
  season:
    'A season is a brainstorm list for this stretch of the year: what you would like it to hold. Nothing here is on a calendar. ' +
    'The arrows beside the title step to the previous or next season. ' +
    '"Under a year goal" holds one card per year goal, with the season goals you put under it. ' +
    'Year goals with nothing this season are folded into one line below the cards; Show opens them. ' +
    '"Not under a year goal" holds season goals with no year goal. That is fine; to connect one, drag it onto a card, or use Move under in its ⋯ menu. ' +
    'Suggest where these go asks Symphony to propose links, which save only when kept. ' +
    'Selecting a goal opens it with what you will need and its month goals. Next: Month chooses what this month holds.',
  month:
    'A month is a plain list of what this month holds, written with its season beside it. Nothing here is on a calendar yet. ' +
    'The parts are named for the season, e.g. "Under a fall goal": one card per season goal, with the month goals under it. ' +
    'Season goals with nothing this month are folded into one line; Show opens them. ' +
    '"Not under a fall goal" (or the current season) holds month goals with no season goal; drag one onto a card, or use Move under in its ⋯ menu, to connect it. ' +
    'Next: Week is where month goals become this week\'s tasks.',
  week:
    'Week is for doing: this week\'s tasks and when they happen. ' +
    '"Still to place" is the shelf of this week\'s tasks that have no day yet; drag one onto a day, or press + to give it a day. ' +
    'Each day column shows its events, tasks and daily routines. Routines to place are repeating things that need a day this week. ' +
    'The month\'s goals (e.g. October goals) can be shown with the shelf; drop a task on one to put it under that goal.',
  today:
    'Today is for doing: what you are doing today, with what you need to do it. ' +
    '"The day" shows the day\'s hours with timed things on them and how much free time is left. ' +
    '"For today" lists things for today without a time; Add task adds one. ' +
    '"This week" holds this week\'s tasks that have no day yet; drag one onto the day, or press +, to plan it for today. ' +
    '"Coming up" shows the next few dated things after today. ' +
    'Open any item to see its notes, people, links and places, or to move it to another day.',
}

export const EXPLAIN_LABEL = 'What is this page?'
export const EXPLAIN_MESSAGE = 'What is this page, and how do I use it? Show me on the page.'

export function hasPageGuide(page: string): boolean {
  return page in PAGE_GUIDES
}

/** The snapshot for a turn, with the page's guide and what is on screen now. */
export function explainContext(ctx: WorkspaceContext, root?: ParentNode): WorkspaceContext {
  const guide = PAGE_GUIDES[ctx.page]
  if (!guide || typeof document === 'undefined') return ctx
  return { ...ctx, guide, targets: collectTargets(root) }
}
