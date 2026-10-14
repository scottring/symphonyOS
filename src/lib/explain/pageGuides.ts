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
    'The line above the list holds last year\'s goals; Show opens them. Each row is a year goal; one with a season goal under it names it ("Fall: …"). ' +
    '+ Add a goal at the foot writes a new one. Go to Fall (or the season shown) goes on to the season. The top bar moves between Today, Week, Month, Season and Year.',
  season:
    'A season is a brainstorm list for this stretch of the year: what you would like it to hold. Nothing here is on a calendar. ' +
    'The arrows beside the title step to the previous or next season. ' +
    'The line above the list holds this year\'s goals; Show opens them. The list holds every season goal, drawn one way. ' +
    'A goal written for a year goal says "For …" under it, and one with a month goal under it names it ("October: …"). A goal on its own says nothing more; that is fine. ' +
    '+ Add a goal at the foot writes one, with an optional "For" to choose a year goal. To change what a goal is for, use Move under in its ⋯ menu. ' +
    'Go to the month goes on to Month.',
  month:
    'Month answers one question: what do you want to accomplish this month? Nothing here is on a calendar yet. ' +
    'The line above the list holds the season\'s goals; Show opens them. The list holds every goal for the month, drawn one way. ' +
    'A goal written for a season goal says "For …" under it, and one with tasks this week names them ("This week: …"). A goal on its own says nothing more; that is fine. ' +
    '+ Add a goal at the foot writes one, with an optional "For" to choose a season goal. To change what a goal is for, use Move under in its ⋯ menu. ' +
    'Go to this week opens Week. To turn a month goal into this week\'s tasks, tell Symphony what to do this week for a goal there.',
  week:
    'Week is for doing: this week\'s tasks and when they happen. ' +
    'The days are the picture of the week: each day column shows its events (in blue), the kids\' specials, tasks (circles) and routines (rounded squares), who carries each, and in green the hours with nothing scheduled ("Calendar clear"). ' +
    'A stay across several days is one bar over those days. Days gone by are dimmed, and this week\'s weekend folds to one line once it is over. ' +
    'One plain sentence about the week sits under the title. ' +
    '"No day yet" lists what is chosen for this week but has no day: drag one onto a day, or on a phone press + to pick the day. ' +
    'Tick a task to finish it, drag it to move it, tap it to open it. ' +
    'Planning is a conversation: "Plan the rest of my week" in the bar at the bottom (on a phone, the button under the title) starts it, and Symphony proposes the changes for you to approve.',
  today:
    'Today is for doing: what you are doing today, with what you need to do it. ' +
    '"The day" shows the day\'s hours with timed things on them and how many hours are still open. ' +
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

// Every guide names parts a page may not be showing right now. A note about
// "Still to place" once landed on the Planning view switch because the shelf
// was not on screen (Scott, 2026-10-13).
const POINT_RULE =
  ' Point each note only at the part it is about. A part named here that is not among the targets is not on screen: leave it out, never point its note at another part.'

/** A page in a different mode (Week's planning session) names its own guide. */
export function guideKey(page: string, root?: ParentNode): string {
  const marked = (root ?? document).querySelector?.('[data-explain-guide]')?.getAttribute('data-explain-guide')
  return marked && marked in PAGE_GUIDES ? marked : page
}

/** The snapshot for a turn, with the page's guide and what is on screen now. */
export function explainContext(ctx: WorkspaceContext, root?: ParentNode): WorkspaceContext {
  if (!PAGE_GUIDES[ctx.page] || typeof document === 'undefined') return ctx
  return { ...ctx, guide: PAGE_GUIDES[guideKey(ctx.page, root)] + POINT_RULE, targets: collectTargets(root) }
}
