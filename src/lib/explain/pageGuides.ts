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
    'The strip on the left holds last year\'s goals still open: → and the year (or a drag onto the list) carries one in. Each row is a year goal; one with a season goal under it names it ("Fall: …"). ' +
    '+ Add a goal at the foot writes a new one. Go to Fall (or the season shown) goes on to the season. The top bar moves between Today, Week, Month, Season and Year.',
  season:
    'A season is a brainstorm list for this stretch of the year: what you would like it to hold. Nothing here is on a calendar. ' +
    'The arrows beside the title step to the previous or next season. ' +
    'The strip on the left holds this year\'s goals: drag one onto a season goal to put it under, or onto the list (or press →) to write something new under it. The list holds every season goal, drawn one way. ' +
    'A goal written for a year goal says "For …" under it, and one with a month goal under it names it ("October: …"). A goal on its own says nothing more; that is fine. ' +
    '+ Add a goal at the foot writes one, with an optional "For" to choose a year goal. To change what a goal is for, use Move under in its ⋯ menu. ' +
    'Go to the month goes on to Month.',
  month:
    'Month answers one question: what do you want to accomplish this month? Nothing here is on a calendar yet. ' +
    'The strip on the left holds the season\'s goals: drag one onto a month goal to put it under, or onto the list (or press →) to write something new under it; its Routines tab holds the monthly routines. The list holds every goal for the month, drawn one way. ' +
    'A goal written for a season goal says "For …" under it, and one with tasks this week names them ("This week: …"). A goal on its own says nothing more; that is fine. ' +
    '+ Add a goal at the foot writes one, with an optional "For" to choose a season goal. To change what a goal is for, use Move under in its ⋯ menu. ' +
    'Go to this week opens Week. To turn a month goal into this week\'s tasks, tell Symphony what to do this week for a goal there.',
  week:
    'Week is for doing: this week\'s tasks and when they happen. ' +
    'The arrows either side of the dates step to the previous or next week; the dates themselves open shorter runs (a weekend, 3 days, a custom range). ' +
    'The line under the dates says how many things are done this week and when the week was planned. ' +
    'The days are the picture of the week: each day column shows its events (in blue), the kids\' specials and two of its tasks with the rest behind "+N more", and who carries each; the week\'s dinners run in one row under the days. ' +
    'A stay across several days is one bar over those days. Days gone by are dimmed, and this week\'s weekend folds to one line once it is over. ' +
    'The strip on the left has three tabs: Week (what is on this week with no day yet — drag one onto a day), Routines (the routines that run on a day or two of this week, by day; every-day ones are on Today) and the month (its open goals — drag one onto a day or press → Week). ' +
    '+ Add to week and + Add to day read what you type the way you would say it ("Dentist for K and E Nov 23 at 9am at Cross Keys"); a date outside this week goes to that date. ' +
    'Tick a task to finish it, drag it to move it, tap it to open it. ' +
    'Plan this week opens the deck: everything without a home this week, one card at a time. Finishing it marks the week planned. ' +
    'Free time (the hours with nothing scheduled, "Calendar clear") and the weather are off until turned on under ⋯, as are done work and the daily routines in each day; each choice is remembered on this device. The ⋯ menu also holds How this page works and Watch the guide. ' +
    'To plan the week by talking, use Chat; on a phone, Talk it through under ⋯.',
  today:
    'Today is for doing: what you are doing today, with what you need to do it. ' +
    '"The day" shows the day\'s hours with timed things on them and how many hours are still open. ' +
    '"For today" lists things for today without a time; Add task adds one. ' +
    '"This week" holds this week\'s tasks that have no day yet; drag one onto the day, or press +, to plan it for today. ' +
    '"Coming up" shows the next few dated things after today. ' +
    'Open any item to see its notes, people, links and places, or to move it to another day.',
  inbox:
    'Inbox holds what you captured and have not decided about yet; the line under the title counts the items to triage. ' +
    'Each row is one capture with Today, This week and Someday beside it; its ⋯ menu offers more times (a date, Next month, This season), Send to a note or to calendar, the Life area (Work, Family, Personal, Unsorted) and Delete. ' +
    'List and Focus at the foot of the title switch between every row at once and one capture at a time; Select turns on checkboxes, and the bar that appears moves, files or deletes several together. ' +
    '"Needs re-filing" lists captures whose area does not match who can see them; "Waiting on" holds things you did your part on and are waiting to hear back about; "Expired" holds older unfinished work. ' +
    'Tap a row to open it. "Inbox zero" means nothing is waiting for a decision.',
  routines:
    'Routines is the picture of what your household does again and again: the repeating patterns, shown as this week\'s occurrences. ' +
    'The arrows beside "Our rhythm" step to the previous or next week; one plain sentence about the rhythm sits under the title. ' +
    '"Every day" holds the routines that happen daily; the grid below has a column per day and a band per time of day (Morning, Afternoon, Evening, Any time), each cell listing that day\'s occurrences with their time and who carries them; a crossed-out one is skipped this week. ' +
    '"Each month" holds the less frequent ones, "No day yet" the ones with no day chosen, and "Not showing" the ones resting or switched off. ' +
    'Tap an occurrence to open its routine, or drag it onto another day. ' +
    'Change our routines starts a conversation in which Symphony reads the week and asks what is changing; New routine writes one in plain words.',
  meals:
    'Meals plans a week of eating and keeps the recipes you cook; the Plan and Recipes tabs under the title switch between them. ' +
    'On Plan the title is the week, the arrows beside "Meals" step between weeks, and each day card has a Breakfast, Lunch and Dinner slot: an empty one offers Pick recipe, Type name, Add for one person… or Leftovers from last night; a filled one\'s ⋯ menu offers Change recipe, Clear and, for a dinner, → Lunch tomorrow. ' +
    'Preferences holds how your family eats, Build shopping list gathers the week\'s ingredients, and the chat beside the week (on a phone, the chat button) plans with Symphony. ' +
    'On Recipes, "Memory shelf" counts what is saved; the + adds a recipe by finding one, pasting a URL or manual entry, the search box searches titles, tags and ingredients, and the row of filters (All, Quick, Both kids will eat, Never cooked, Prep-friendly) narrows the shelf. ' +
    'Tap a recipe card to open it.',
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
