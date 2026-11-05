import type { SessionHorizon } from '@/hooks/usePlanningSession'

export type GuideLevel = 'day' | 'week' | 'month' | 'season' | 'year'

// Duplicated in supabase/functions/symphony-agent/guideMode.ts (Deno cannot
// import src/). Keep the two unions identical.
export type StepWrite =
  | 'review'
  | 'triage'
  | 'commit'
  | 'place'
  | 'inbox'
  | 'plan_add'
  | 'note'
  | 'area'
  | 'event'
  | 'scratchpad'
  | 'none'

/** What a step opens on the page (planning on the page, 2026-11-04): the
 *  sheet above (`above`), this period's calendar (`calendar`), the write line
 *  focused (`write`), or the sheet above turned to the period before with its
 *  choices (`look`, which opens the sheet above). Read by PaperFold's `drive`;
 *  nothing is remembered. */
export interface StepDrives {
  above?: boolean
  calendar?: boolean
  write?: boolean
  look?: boolean
}

export interface GuideStep {
  id: string
  title: string
  minutes: number
  why: string
  you: string
  guide: string
  more: string
  writes: StepWrite[]
  choosing?: true
  /** The parts of the page this step opens. None: the page as it is. */
  drives?: StepDrives
  /** Where the step's tooltip points: the element on the page marked
   *  `data-guide-anchor="<at>"`, the step's permanent home on the everyday
   *  page (planning as tooltips, 2026-11-04: no step has a card of its own).
   *  Missing on the page, the tooltip points at `fallback`, else the page
   *  title (`title`). */
  at: GuideAnchor
  /** Where it points when its own home is not on the page (Today's look
   *  back with no leftovers: the week's fold). */
  fallback?: GuideAnchor
}

/** The places on the everyday pages a step's tooltip can point at. */
export type GuideAnchor =
  | 'left' | 'right' | 'write' | 'list' | 'title' | 'leftovers' | 'day' | 'energy'
  | 'routines' | 'inbox' | 'dinner' | 'family' | 'menu' | 'ideal-week' | 'vision'
  | 'landscape' | 'areas' | 'wild-cards'

export const SESSION_LENGTH: Record<GuideLevel, string> = {
  day: '10 to 15 minutes',
  week: 'about an hour',
  month: 'under two hours',
  season: 'about half a day',
  year: 'one or two days',
}

export const HORIZON_OF: Record<GuideLevel, SessionHorizon> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  season: 'seasonal',
  year: 'annual',
}

const DAY: readonly GuideStep[] = [
  {
    id: 'look-back',
    at: 'leftovers',
    // No leftovers: the week's fold beside the day, not the page title.
    fallback: 'left',
    title: 'Look back at {before}',
    minutes: 2,
    why: 'Catch anything {before} left unfinished.',
    // Task 4 (Scott, 2026-11-04): what was left goes back where it came
    // from, the week sheet beside the day, first and marked with its day.
    you: 'Leftovers are at the top of the week sheet on the left, marked with their day. Tap + to plan one for {day}, or leave it on the week.',
    guide: 'Shows what\'s left and moves it where you say.',
    more: 'An item that slips off the end of a busy day does not announce itself. A quick look puts it in front of you while it still matters. Then it gets a deliberate answer instead of resurfacing days later.',
    // The day's "win" is dropped for now (fix round 1): nothing writes a
    // review of the day before. A + plans a leftover for the day.
    writes: ['place'],
    // The week opens beside the day: the leftovers are first on it.
    drives: { above: true },
  },
  {
    id: 'calendar',
    at: 'day',
    title: '{Day}\'s calendar',
    minutes: 2,
    why: 'See where {day}\'s free time is.',
    you: 'The timeline shows {day}\'s fixed appointments. The gaps between them are the time you actually have.',
    guide: 'Shows the day as a timeline.',
    more: 'The gaps between fixed things are the only time you really have. Seeing the day laid out shows how much room there is between commitments. That is easier to judge before anything is placed in it.',
    writes: ['none'],
  },
  {
    id: 'energy',
    at: 'energy',
    title: 'Energy',
    minutes: 1,
    why: 'Choose work that fits how you\'ll feel.',
    // Asked in the tooltip itself (Task 4): Low · Medium · High.
    you: 'Pick low, medium or high below. It\'s only a note beside the day; nothing else changes.',
    guide: 'Notes it beside the day. Nothing else changes.',
    more: 'The same task feels different depending on how rested you are. Saying plainly how the day ahead feels lets the choices that follow be honest ones. Nothing is decided by it; it is just a note beside the day.',
    writes: ['note'],
  },
  {
    id: 'pick',
    at: 'left',
    title: 'Pick 3 to 5',
    minutes: 5,
    why: 'A few real priorities beat a long hopeful list.',
    you: 'The week sheet is on the left. Tap + on the tasks that fit {day}\'s free time, or drag one onto the timeline. Aim for 3 to 5.',
    guide: 'Places each where you say and counts toward 5.',
    more: 'A long list leaves you deciding all day what to do next. A few chosen items each have a place, and the rest can wait without nagging. The count is a guide you can see, not a limit that is enforced.',
    writes: ['place'],
    // The week opens beside the day: + on three to five (the prototype's Pick).
    drives: { above: true },
    choosing: true,
  },
  {
    id: 'habits',
    at: 'routines',
    title: 'Habits',
    minutes: 1,
    why: 'Small routines are the first thing to slip.',
    you: 'Glance at {day}\'s routines on the week sheet. Nothing to decide here; tick them off as you go.',
    guide: 'Lists the day\'s routines to tick off as you go.',
    more: 'Small routines rarely feel urgent, so they tend to drop first. A glance at them while the day is still ahead is often enough to keep them from slipping. They are only listed here, never added for you.',
    writes: ['none'],
    drives: { above: true },
  },
]

const WEEK: readonly GuideStep[] = [
  {
    id: 'look-back',
    at: 'left',
    title: 'Look back at last week',
    minutes: 15,
    why: 'Close out last week before planning this one.',
    you: 'Write what went well and what didn\'t. Then decide each unfinished task: Done (it finished, just wasn\'t checked off), Next week (carry it forward), Someday (not now), or Let go (not ever). Nothing carries over unless you choose it.',
    guide: 'Goes through last week\'s open items one at a time and records your call.',
    more: 'Open items from last week tend to ride along unexamined and make the new week feel heavy before it starts. Deciding what happens to each one means it either gets a place or is released. Naming what went well first keeps the look back from feeling like a list of failures.',
    writes: ['review', 'triage'],
    drives: { above: true, look: true },
  },
  {
    id: 'calendar',
    at: 'day',
    title: 'Calendar check',
    minutes: 10,
    why: 'See how full the week already is before adding to it.',
    you: 'Walk each day\'s events. Fix clashes and tight changeovers now, and add anything that\'s missing.',
    guide: 'Points out overlaps and back-to-back moves. You decide what changes.',
    more: 'A busy week has less room than an empty one, and that should set how much you take on. Clashes and tight changeovers are cheap to fix before the week begins and cost a scramble once the day arrives. You decide what changes; the guide only points out what it sees.',
    writes: ['place'],
  },
  {
    id: 'read-month',
    at: 'left',
    title: 'Read {month}',
    minutes: 5,
    why: 'Make sure this week moves the month forward.',
    you: '{month}\'s goals are on the left, for reading only. Ask what this week could do for each. Nothing gets copied across; you\'ll write the week\'s tasks in their own words.',
    guide: 'Opens the month beside the week, for reading.',
    more: 'A month can drift when each week is planned on its own. Reading its list before choosing keeps the week pointed the same way. It is easy to forget what the month was for until it is nearly gone.',
    writes: ['none'],
    drives: { above: true },
  },
  {
    id: 'inbox',
    at: 'inbox',
    title: 'Clear the inbox',
    minutes: 10,
    why: 'Nothing hidden should surprise you mid-week.',
    you: 'Open the Inbox and give each capture an answer: this week, a later time, Someday, or delete.',
    guide: 'Shows each Inbox item and files it where you say.',
    more: 'Captures made in a hurry sit in the Inbox until they matter too late. Giving each one a quick answer keeps the pile from growing into something you avoid. Each is either this week, later, or gone.',
    writes: ['inbox'],
  },
  {
    id: 'choose',
    at: 'write',
    title: 'Choose this week\'s tasks',
    minutes: 15,
    why: 'A short list gets done. About 15 is the limit.',
    you: 'Write tasks with + Add to week; they land in Sometime this week. Drag one onto a day, or leave it for whenever this week. {month} stays on the left to read.',
    guide: 'Puts each on this week and counts toward 15.',
    more: 'A week has only so many open hours once everything fixed is counted. A short list that fits is more useful than a long one that mostly rolls into next week. The month stays as it is; the week is written in its own words.',
    writes: ['commit', 'place'],
    drives: { above: true, write: true },
    choosing: true,
  },
  {
    id: 'ops',
    at: 'dinner',
    title: 'Meals, workouts and the weekend',
    minutes: 10,
    why: 'The routine parts of the week decide how it feels.',
    you: 'Plan the dinners, put workouts and bedtimes on their days, and decide what the weekend is for.',
    guide: 'Puts workouts on their days and keeps your weekend note.',
    more: 'The ordinary structure of the week decides how it feels more than any single task. Settling the repeating pieces once saves a lot of small decisions later. The weekend is worth a line of its own so it does not get filled by accident.',
    writes: ['place', 'note'],
  },
  {
    id: 'family',
    at: 'family',
    title: 'Tell the family',
    minutes: 5,
    why: 'Everyone should know the week before it starts.',
    you: 'Write what the family needs to know on the wall, then talk it through at dinner.',
    guide: 'Posts what you say to mention on the wall for the week.',
    more: 'A plan that only one person has seen tends to surprise everyone else. Putting the week where the household can see it lets others plan around it too. Talking it through together turns it from your plan into the family\'s.',
    writes: ['scratchpad'],
  },
]

const MONTH: readonly GuideStep[] = [
  {
    id: 'fresh-start',
    at: 'menu',
    title: 'Fresh start',
    minutes: 5,
    why: 'Mark the turn of the month.',
    you: 'Open ⋯ → Fresh start and pick {this}\'s scenery. It\'s only a visual signal that {prev} is closed, so skip it if you like.',
    guide: 'Changes Symphony\'s scenery for you.',
    more: 'A small visible change marks the turn of the month. Opening the app to a different scene tells you that the last month is closed and this one has not been spent yet. It is a gentle signal, nothing more.',
    writes: ['note'],
  },
  {
    id: 'look-back',
    at: 'left',
    title: 'Look back at {prev}',
    minutes: 20,
    why: 'Close out {prev} before planning {this}.',
    you: 'Write what went well and what didn\'t. Then decide each unfinished goal: Done (it finished, just wasn\'t checked off), To {this} (carry it forward), Someday (not now), or Let go (not ever). Nothing carries over unless you choose it.',
    guide: 'Shows what got done and records your call on each open line.',
    more: 'It is easy to remember only what did not get done. Naming what was finished first gives a truer picture. Then each open line gets a clear decision: done, on to this month, Someday, or let go.',
    writes: ['review', 'triage'],
    drives: { above: true, look: true },
  },
  {
    id: 'read-season',
    at: 'left',
    title: 'Read {above}',
    minutes: 10,
    why: 'Remember what this season is for.',
    you: '{above}\'s goals are on the left, for reading only. Ask which ones {this} should move forward. Nothing gets copied across; you\'ll write {this}\'s goals in your own words in a later step.',
    guide: 'Opens the season beside the month, for reading.',
    more: 'A season goal only moves if some month does something toward it. Reading the season first makes it plain what this month could be for. That helps you judge whether this month is the one to move each.',
    writes: ['none'],
    drives: { above: true },
  },
  {
    id: 'next-weeks',
    at: 'right',
    title: '{this}\'s calendar',
    minutes: 15,
    why: 'See what already has a claim on {this}\'s time.',
    you: 'The right sheet shows trips, visitors, days off and weekend plans. If something\'s missing, write it on {this}\'s list with its date ("Ron visiting Nov 20") and it lands on that day.',
    guide: 'Adds what you mention on its date.',
    more: 'Dates that are already fixed shape how much each coming week can hold. This far out the calendar is mostly settled, so it works as a frame for everything else. Anything you remember that is not on it yet is best added now.',
    writes: ['place'],
    drives: { calendar: true },
  },
  {
    id: 'by-area',
    at: 'write',
    title: '{this}\'s goals',
    minutes: 30,
    why: 'This is where the month gets decided.',
    you: 'Write {this}\'s goals on the middle sheet. Pick an area above the line to go one area at a time, so no part of life gets crowded out. {above} stays open on the left.',
    guide: 'Files each in its area. Asks when it can\'t tell.',
    more: 'Going area by area keeps one busy part of life from crowding out the others. The season stays open beside you, so the month is written with it in view. When the guide cannot tell which area a line belongs to, it asks rather than guessing.',
    writes: ['commit', 'plan_add', 'area'],
    drives: { above: true, write: true },
    choosing: true,
  },
  {
    id: 'upkeep-fun',
    // The month's routines, on the calendar sheet (Routines this month).
    at: 'routines',
    title: 'Upkeep and fun',
    minutes: 15,
    why: 'Chores and fun both slip unless they\'re written down.',
    you: 'The right sheet lists {this}\'s routines: bills, orders and upkeep. Check they\'re right, then write at least one fun thing on {this}\'s list.',
    guide: 'Shows the monthly routines and adds your fun lines.',
    more: 'Recurring upkeep is easy to forget between cycles, so it helps to see what is due. Fun works the same way in reverse: it rarely happens unless it has a line of its own. The lines are yours; the guide only adds what you name.',
    writes: ['plan_add'],
    drives: { calendar: true },
  },
]

const SEASON: readonly GuideStep[] = [
  {
    id: 'look-back',
    at: 'left',
    title: 'Look back at {prev}',
    minutes: 30,
    why: 'Close out {prev} before planning {this}.',
    you: 'Write what went well and what didn\'t. Then decide each unfinished goal: Done (it finished, just wasn\'t checked off), To {this} (carry it forward), Someday (not now), or Let go (not ever). Nothing carries over unless you choose it.',
    guide: 'Goes through last season\'s open goals one at a time and records your call.',
    more: 'Three months is long enough for goals to change meaning. Closing out each open goal on purpose keeps old intentions from crowding the new season. Naming the wins first makes the review fairer.',
    writes: ['review', 'triage'],
    drives: { above: true, look: true },
  },
  {
    id: 'from-year',
    at: 'left',
    title: 'Read {above}',
    minutes: 20,
    why: 'Remember what this year is for.',
    you: '{above}\'s goals are on the left, for reading only, with Someday under them. Ask which ones {this} should move forward, and bring back anything from Someday whose time has come.',
    guide: 'Keeps the year list beside you, for reading. Nothing moves across.',
    more: 'The year list already holds what you decided mattered. Reading it first means the season is written with the year in view, in its own words. Someday holds what was set aside until its time came.',
    writes: ['commit'],
    drives: { above: true },
  },
  {
    id: 'calendar',
    at: 'right',
    title: '{this}\'s calendar',
    minutes: 20,
    why: 'Breaks and trips take whole weeks out of a season.',
    you: 'The right sheet shows {this}\'s fixed dates, month by month. If a trip, school break or deadline is missing, write it on {this}\'s list with its date and it lands on that day.',
    guide: 'Adds the dates and shows which weeks are already full.',
    more: 'Breaks and trips remove whole stretches from a season. Marking them first shows how much time is really open before any goal is given a place. Weeks that are already full are worth knowing about early.',
    writes: ['place'],
    drives: { calendar: true },
  },
  {
    id: 'energy',
    at: 'energy',
    title: 'Energy check',
    minutes: 10,
    why: 'A plan that ignores how tired you are falls apart by week three.',
    // Asked in the tooltip itself (Task 4): Low · Medium · High.
    you: 'Pick low, medium or high below. It stays in the header all season, and you can change it there.',
    guide: 'Keeps your note at the top of the season.',
    more: 'A season with unusual demands on your health or attention has less room in it than the calendar suggests. Writing that down once lets the later choices respect it. A plan that ignores how tired you are tends to fall apart partway through.',
    writes: ['note'],
  },
  {
    id: 'by-area',
    at: 'write',
    title: '{this}\'s goals',
    minutes: 30,
    why: 'This is where the season gets decided.',
    you: 'Write {this}\'s goals on the middle sheet. Pick an area above the line to go one area at a time. Aim for what three months can finish. {above} stays open on the left.',
    guide: 'Files each in its area. Asks when it can\'t tell.',
    more: 'A year goal is often too large to finish, but something toward it can be done in three months. Going area by area makes sure no part of life is skipped by accident. The year stays open beside you while you write.',
    writes: ['plan_add', 'area'],
    drives: { above: true, write: true },
    choosing: true,
  },
  {
    id: 'ideal-week',
    at: 'ideal-week',
    title: 'Ideal week',
    minutes: 30,
    why: 'Check that these goals fit into a real week.',
    you: 'Below the sheet, block out sleep, work, school runs and meals, then the hours each goal needs. The total shows what\'s left.',
    guide: 'Adds up the hours as you go and shows what\'s left.',
    more: 'After the fixed parts of a week are blocked out, fewer free hours remain than it feels like. Adding up the time each goal needs shows whether it fits beside the rest. If it does not, that is useful to learn now rather than in the middle of the season.',
    writes: ['note'],
  },
  {
    id: 'wild-cards',
    at: 'wild-cards',
    title: 'Wild cards',
    minutes: 20,
    why: 'Seasonal logistics sneak up: money, camps, travel, the house.',
    you: 'Below the sheet, turn on the categories that apply this season. Write anything they remind you of on {this}\'s list.',
    guide: 'Turns each to-do into a line on the season, or the month it\'s due.',
    more: 'Some obligations have deadlines that arrive quietly and then become urgent. Going through the usual categories once a season catches them while there is still time. Each one you name becomes a line where it belongs.',
    writes: ['plan_add'],
  },
]

const YEAR: readonly GuideStep[] = [
  {
    id: 'look-back',
    at: 'left',
    title: 'Look back at {prev}',
    minutes: 45,
    why: 'Know what {prev} taught you before setting {this}.',
    you: 'Write what went well and what didn\'t. Then decide each unfinished goal: Done (it finished, just wasn\'t checked off), To {this} (carry it forward), Someday (not now), or Let go (not ever). Nothing carries over unless you choose it.',
    guide: 'Shows last year\'s goals with what got done, and records your call on each open one.',
    more: 'A year holds more than memory keeps. Looking at what was actually finished is often kinder than the impression you carried. The goals that stalled show what to do differently next time.',
    writes: ['review', 'triage'],
    drives: { above: true, look: true },
  },
  {
    id: 'vision',
    at: 'vision',
    title: 'Picture 5–10 years out',
    minutes: 30,
    why: 'The long view keeps the year pointed somewhere.',
    you: 'Below the sheet, describe an ordinary day ten years from now, then what would make {this} a success. It\'s kept in your words; nothing is added.',
    guide: 'Writes it down in your words. Adds nothing.',
    more: 'Goals chosen without a direction tend to be whatever was loudest. Describing an ordinary day far in the future gives the year something to be measured against. It is written down in your words and nothing is added.',
    writes: ['note'],
  },
  {
    id: 'landscape',
    at: 'landscape',
    title: 'Map the 12 months',
    minutes: 45,
    why: 'Fixed dates decide how much room each month really has.',
    you: 'Below the sheet, go month by month: trips, deadlines, school breaks, holidays and family events. The calendar on the right shows what\'s already there.',
    guide: 'Puts each on a one-page year and points out crowded months.',
    more: 'A year looks open until the fixed dates go on it. Once they are marked, it is clear which months have room for something large and which do not. A crowded month is worth seeing before goals are set.',
    writes: ['note', 'place'],
    drives: { calendar: true },
  },
  {
    id: 'areas',
    at: 'areas',
    title: 'Choose life areas',
    minutes: 15,
    why: 'Areas make sure no part of life is forgotten.',
    you: 'Below the sheet, pick 3 to 8 areas. Each sits inside Work, Family or Personal, which decides who can see it.',
    guide: 'Asks which space each area belongs in when it isn\'t obvious.',
    more: 'Areas act as a checklist for the whole of life, so that no part is forgotten. Placing each one inside a space also settles who can see it. The areas are yours to choose; the guide does not propose any.',
    writes: ['area'],
  },
  {
    id: 'brain-dump',
    at: 'write',
    title: 'Brain dump goals',
    minutes: 45,
    why: 'Get everything out before judging any of it.',
    you: 'Write every goal you can think of on {this}\'s sheet, one area at a time. Don\'t filter yet. {prev}\'s open goals stay on the left.',
    guide: 'Sorts each goal into its area. Points out an empty area; never fills it.',
    more: 'Judging while listing makes the list shorter and safer than what you actually want. For now every goal can sit side by side, and the sorting comes later. An area left empty is pointed out, but never filled for you.',
    writes: ['plan_add', 'area'],
    drives: { above: true, write: true },
    choosing: true,
  },
  {
    id: 'refine',
    at: 'list',
    title: 'Refine the list',
    minutes: 30,
    why: 'End with a list you\'d want to reread for twelve months.',
    you: 'Goals that may overlap are shown on the sheet. For each pair, keep both, move one to Someday, or let one go.',
    guide: 'Shows goals that overlap or repeat. You decide what happens to them.',
    more: 'A raw list usually has goals that overlap and a few that can wait. Merging the ones that say the same thing and moving others to Someday leaves a list you will want to reread. Each decision stays with you.',
    writes: ['triage'],
  },
  {
    id: 'share-book',
    at: 'list',
    title: 'Share and book the next session',
    minutes: 10,
    why: 'Plans stick when the family knows them and the next check-in is booked.',
    you: 'Set a goal\'s space to Family to share it. Then book the first season session below.',
    guide: 'Moves shared goals to Family and puts the season session on the calendar.',
    more: 'A goal that affects others works best when they know about it. Booking the next session while the year is fresh means the plan gets revisited rather than forgotten. You choose what the family sees.',
    writes: ['triage', 'place'],
  },
]

export const GUIDE_STEPS: Record<GuideLevel, readonly GuideStep[]> = {
  day: DAY,
  week: WEEK,
  month: MONTH,
  season: SEASON,
  year: YEAR,
}

/** The words a step's title, why and you name (Scott, 2026-11-05: the
 *  tooltips say "October", not "last month"): `{this}` the period planned,
 *  `{prev}` the one before, `{above}` the level above, `{month}` the week's
 *  month, `{day}`/`{Day}`/`{before}` the day planned and the one before it. */
export type StepWords = Readonly<Record<string, string>>

/** A step's text with its words filled in; an unknown word stays as written. */
export function wordsIn(text: string, words?: StepWords): string {
  return words ? text.replace(/\{(\w+)\}/g, (m, k: string) => words[k] ?? m) : text
}

/** The step with its words filled in, everywhere it is shown. */
export function stepIn(step: GuideStep, words?: StepWords): GuideStep {
  if (!words) return step
  return { ...step, title: wordsIn(step.title, words), why: wordsIn(step.why, words), you: wordsIn(step.you, words), guide: wordsIn(step.guide, words), more: wordsIn(step.more, words) }
}

export function stepsFor(level: GuideLevel): readonly GuideStep[] {
  return GUIDE_STEPS[level]
}

export function choosingStep(level: GuideLevel): GuideStep {
  const step = GUIDE_STEPS[level].find(s => s.choosing)
  if (!step) throw new Error(`No choosing step for level ${level}`)
  return step
}
