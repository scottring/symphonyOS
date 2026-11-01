import type { SessionHorizon } from '@/hooks/usePlanningSession'

export type GuideLevel = 'day' | 'week' | 'month' | 'season' | 'year'

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
}

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
    title: 'Look back at yesterday',
    minutes: 2,
    why: 'Nothing left from yesterday should quietly vanish.',
    you: 'Each unfinished item: today, back to the week, or done.',
    guide: 'Shows what\'s left and moves it where you say.',
    more: 'An item that slips off the end of a busy day does not announce itself. If the dentist call went undone yesterday, a quick look puts it in front of you while it still matters, instead of surfacing on Friday.',
    writes: ['triage', 'review'],
  },
  {
    id: 'calendar',
    title: 'Today\'s calendar',
    minutes: 2,
    why: 'Fixed times decide where the free space is.',
    you: 'Read the day\'s appointments and what each needs.',
    guide: 'Shows the day as a timeline.',
    more: 'The gaps between fixed things are the only time you really have. A 3:30 pickup and a 5:00 practice leave a small window in between, and it helps to see that before anything is placed in it.',
    writes: ['none'],
  },
  {
    id: 'energy',
    title: 'Energy',
    minutes: 1,
    why: 'Pick work that fits how you feel today.',
    you: 'Say how you\'re doing: high, medium or low.',
    guide: 'Notes it beside the day. Nothing else changes.',
    more: 'The same task feels different after a night of poor sleep. Saying out loud that today is a low day lets the choices that follow be honest ones, rather than the ones a better-rested version of you would make.',
    writes: ['note'],
  },
  {
    id: 'pick',
    title: 'Pick 3 to 5',
    minutes: 5,
    why: 'A few real priorities beat a long hopeful list.',
    you: 'Choose from this week\'s list what fits the free space.',
    guide: 'Places each where you say and counts toward 5.',
    more: 'A list of twelve things leaves you deciding all day what to do next. With four chosen, the school form and the grocery run each have a place, and the rest of the week\'s list can wait without nagging.',
    writes: ['place'],
    choosing: true,
  },
  {
    id: 'habits',
    title: 'Habits',
    minutes: 1,
    why: 'Small daily routines are easy to skip without a check.',
    you: 'Glance at the day\'s routines.',
    guide: 'Lists the day\'s routines to tick off as you go.',
    more: 'Routines like vitamins, a walk, or the kids\' reading time rarely feel urgent, so they drop first. A glance at them while the day is still ahead is often enough to keep them from slipping.',
    writes: ['none'],
  },
]

const WEEK: readonly GuideStep[] = [
  {
    id: 'look-back',
    title: 'Look back at last week',
    minutes: 15,
    why: 'Close last week before opening this one.',
    you: 'Wins first. Then each loose end: move it, break it smaller, hand it off, or drop it.',
    guide: 'Goes through last week\'s open items one at a time and records your call.',
    more: 'Open items from last week tend to ride along unexamined and make the new week feel heavy before it starts. If the car registration never got done, deciding what happens to it now means it either gets a day or gets released.',
    writes: ['review', 'triage'],
  },
  {
    id: 'read-month',
    title: 'Read the month',
    minutes: 5,
    why: 'The week should move the month forward.',
    you: 'Read the month\'s list and what\'s left on it.',
    guide: 'Shows the month\'s lines with what\'s already planned under each.',
    more: 'A month can drift when each week is planned on its own. Seeing that "sort the garage" has had nothing under it for three weeks is the kind of thing that is easy to miss until the month is nearly gone.',
    writes: ['none'],
  },
  {
    id: 'calendar',
    title: 'Calendar check',
    minutes: 10,
    why: 'Clashes and tight changeovers are easier to fix on Sunday than on Tuesday.',
    you: 'Walk each day. Say what\'s wrong or missing.',
    guide: 'Points out overlaps and back-to-back moves. You decide what changes.',
    more: 'Two things booked at the same hour, or a pickup right after a meeting across town, are cheap to fix before the week begins. Once Tuesday arrives, the same clash costs a scramble and a few favors.',
    writes: ['place'],
  },
  {
    id: 'inbox',
    title: 'Clear the inbox',
    minutes: 10,
    why: 'Nothing hidden should surprise you mid-week.',
    you: 'Each capture: this week, later, or gone.',
    guide: 'Shows each Inbox item and files it where you say.',
    more: 'Captures made in a hurry, like a photo of a flyer or a note about a birthday gift, sit in the Inbox until they matter too late. Giving each one a quick answer keeps the pile from growing into something you avoid.',
    writes: ['inbox'],
  },
  {
    id: 'choose',
    title: 'Choose this week\'s tasks',
    minutes: 15,
    why: 'A short list gets done. About 15 is the limit.',
    you: 'Say what this week needs. Take from the month or add new.',
    guide: 'Files each under its month line and counts toward 15.',
    more: 'A week has only so many open hours once work, school and meals are counted. Fifteen tasks that fit is more useful than thirty that mostly roll into next week, and each one stays tied to the month line it serves.',
    writes: ['commit', 'place'],
    choosing: true,
  },
  {
    id: 'ops',
    title: 'Weekly ops',
    minutes: 10,
    why: 'Meals, workouts, sleep and the weekend run the week.',
    you: 'Plan dinners, workouts, bedtimes, and what the weekend is for.',
    guide: 'Puts workouts on their days and keeps your weekend note.',
    more: 'The ordinary structure of the week decides how it feels more than any single task. Knowing Thursday dinner is soccer-night takeout, and that Saturday morning is free, saves a dozen small decisions later.',
    writes: ['place', 'note'],
  },
  {
    id: 'family',
    title: 'Tell the family',
    minutes: 5,
    why: 'Everyone should know the week before it starts.',
    you: 'Say what the family needs to know, then talk it through at dinner.',
    guide: 'Posts what you say to mention on the wall for the week.',
    more: 'A plan that only one person has seen tends to surprise everyone else. A line on the wall about Wednesday\'s late pickup and the grandparents arriving Friday lets the kids and your partner plan around it too.',
    writes: ['scratchpad'],
  },
]

const MONTH: readonly GuideStep[] = [
  {
    id: 'fresh-start',
    title: 'Fresh start',
    minutes: 5,
    why: 'A visible reset makes a new month feel like a new start.',
    you: 'Pick this month\'s scenery.',
    guide: 'Changes Symphony\'s scenery for you.',
    more: 'A small visible change marks the turn of the month. Opening the app to a different scene on the first morning tells you that last month is closed and this one has not been spent yet.',
    writes: ['note'],
  },
  {
    id: 'look-back',
    title: 'Look back at last month',
    minutes: 20,
    why: 'Know what moved before deciding what\'s next.',
    you: 'Wins first, and how your energy has been. Then what\'s open: carry, back to the season, or drop.',
    guide: 'Shows what got done and records your call on each open line.',
    more: 'It is easy to remember only what did not get done. Naming the finished school registration and the dentist visits first gives a truer picture, and then each open line, like "repaint the hallway", gets a clear decision.',
    writes: ['review', 'triage'],
  },
  {
    id: 'read-season',
    title: 'Read the season list',
    minutes: 10,
    why: 'The month should move the season\'s goals forward.',
    you: 'Read the season\'s goals and how far each has come.',
    guide: 'Shows each season goal with its steps done so far.',
    more: 'A season goal only moves if some month takes a piece of it. Seeing that "organize the basement" has no finished steps yet makes it plain whether this month is the one to start.',
    writes: ['none'],
  },
  {
    id: 'next-weeks',
    title: 'Next 4–5 weeks',
    minutes: 15,
    why: 'This far out the calendar is mostly settled. Plan around it.',
    you: 'Look at each week\'s fixed dates and say what\'s missing.',
    guide: 'Adds what you mention on its date.',
    more: 'Dates like a school concert, a cousin\'s wedding or a long weekend away are already fixed, and they shape how much each week can hold. Anything you remember that is not on the calendar yet is best added now.',
    writes: ['place'],
  },
  {
    id: 'by-area',
    title: 'The month by area',
    minutes: 30,
    why: 'This is where goals start to look like tasks.',
    you: 'Say what the month should get done, area by area.',
    guide: 'Files each under its season goal and area. Asks when it can\'t tell.',
    more: 'Going area by area, such as Home, Money and Family, keeps one busy area from crowding out the others. A line like "get two quotes for the roof" belongs under its season goal so the month stays connected to the bigger aim.',
    writes: ['commit', 'plan_add', 'area'],
    choosing: true,
  },
  {
    id: 'upkeep-fun',
    title: 'Maintenance and fun',
    minutes: 15,
    why: 'Bills, decluttering and supply orders come round again. Fun gets lost unless it\'s planned.',
    you: 'Check this month\'s routines, then name a thing or two just for fun.',
    guide: 'Shows the monthly routines and adds your fun lines.',
    more: 'Recurring chores like paying the quarterly tax or reordering filters are easy to forget between cycles. Fun works the same way in reverse: a Saturday at the lake only happens if it has a line of its own.',
    writes: ['plan_add'],
  },
]

const SEASON: readonly GuideStep[] = [
  {
    id: 'look-back',
    title: 'Look back at last season',
    minutes: 30,
    why: 'A season is a fresh start only if the last one is closed out.',
    you: 'Wins first. Then each open goal: carry it, table it for later, or drop it.',
    guide: 'Goes through last season\'s open goals one at a time and records your call.',
    more: 'Three months is long enough for goals to change meaning. A goal like "get the kids on a swim team" may have been settled by a different plan, and closing it out on purpose keeps old intentions from crowding the new season.',
    writes: ['review', 'triage'],
  },
  {
    id: 'from-year',
    title: 'Choose from the year',
    minutes: 20,
    why: 'Season goals should come from the year list, not from scratch.',
    you: 'Read the year\'s list and Someday. Pick what fits these three months.',
    guide: 'Keeps the year list beside you. A goal you pick stays linked to its year goal.',
    more: 'The year list already holds what you decided mattered. Choosing from it, rather than starting blank, means a goal like "finish the kitchen" in spring still points back to the year it came from.',
    writes: ['commit'],
  },
  {
    id: 'calendar',
    title: 'Season calendar',
    minutes: 20,
    why: 'Holidays and school breaks eat time you might be counting on.',
    you: 'Mark trips, breaks and deadlines for the season.',
    guide: 'Adds the dates and shows which weeks are already full.',
    more: 'A two-week school break or a family trip removes whole weeks from the season. Marking them first shows how many weeks are really open before any goal is given a place.',
    writes: ['place'],
  },
  {
    id: 'energy',
    title: 'Energy check',
    minutes: 10,
    why: 'A plan that ignores how tired you are falls apart by week three.',
    you: 'Say how your energy, health and bandwidth honestly look.',
    guide: 'Keeps your note at the top of the season.',
    more: 'A season with a new baby, a hard stretch at work or a recovery from surgery has less room in it than the calendar suggests. Writing that down once lets the later choices respect it.',
    writes: ['note'],
  },
  {
    id: 'by-area',
    title: 'Season goals by area',
    minutes: 30,
    why: 'Turns year goals into something three months can finish.',
    you: 'Name the goals for this season, area by area.',
    guide: 'Files each under its year goal and area. Asks when one has no year goal.',
    more: 'A year goal such as "get healthier" is too large to finish, but "see the doctor and book the physical" can be done in three months. Going area by area makes sure nothing like Health or Money gets skipped by accident.',
    writes: ['plan_add', 'area'],
    choosing: true,
  },
  {
    id: 'ideal-week',
    title: 'Ideal week',
    minutes: 30,
    why: 'Tests whether these goals physically fit into 168 hours.',
    you: 'Block sleep, work, school runs and meals. Then the time each goal needs.',
    guide: 'Adds up the hours as you go and shows what\'s left.',
    more: 'After sleep, work, school runs and meals, a week holds fewer free hours than it feels like. Adding up the time a goal like "train for the 10K" needs shows whether it fits beside the rest.',
    writes: ['note'],
  },
  {
    id: 'wild-cards',
    title: 'Wild cards',
    minutes: 20,
    why: 'Seasonal logistics sneak up: money, camps, travel, the house.',
    you: 'Pick the checks that apply this season and say what needs doing.',
    guide: 'Turns each to-do into a line under the right goal, or the month it\'s due.',
    more: 'Things like summer camp sign-ups, passport renewals or a furnace service have deadlines that arrive quietly. Going through the common ones once a season catches them while there is still time.',
    writes: ['plan_add'],
  },
]

const YEAR: readonly GuideStep[] = [
  {
    id: 'look-back',
    title: 'Look back at last year',
    minutes: 45,
    why: 'You can\'t set next year well without knowing what this one taught you.',
    you: 'Name the wins first. Then what didn\'t work, and why.',
    guide: 'Shows last year\'s goals with what got done, and records your call on each open one.',
    more: 'A year holds more than memory keeps. Looking at what was actually finished, such as the move, the new job or the trip, is often kinder than the impression you carried, and the goals that stalled show what to do differently.',
    writes: ['review', 'triage'],
  },
  {
    id: 'vision',
    title: 'Picture 5–10 years out',
    minutes: 30,
    why: 'The long view keeps the year\'s goals pointing somewhere.',
    you: 'Describe an ordinary day ten years from now. Then: what would make this year a success?',
    guide: 'Writes it down in your words. Adds nothing.',
    more: 'Goals chosen without a direction tend to be whatever was loudest. Describing an ordinary Tuesday ten years out, who is at the table and where you live, gives the year something to be measured against.',
    writes: ['note'],
  },
  {
    id: 'landscape',
    title: 'Map the 12 months',
    minutes: 45,
    why: 'Fixed dates decide how much room each month really has.',
    you: 'Go month by month: trips, deadlines, school breaks, holidays, family events.',
    guide: 'Puts each on a one-page year and points out crowded months.',
    more: 'A year looks open until the fixed dates go on it. Once the August wedding, the tax deadline and two school breaks are marked, it is clear which months can carry a big project and which cannot.',
    writes: ['note', 'place'],
  },
  {
    id: 'areas',
    title: 'Choose life areas',
    minutes: 15,
    why: 'Areas make sure no part of life is forgotten.',
    you: 'Pick 3 to 8. Each sits inside Work, Family or Personal, which decides who sees it.',
    guide: 'Asks which space each area belongs in when it isn\'t obvious.',
    more: 'Areas such as Health, Money or Home act as a checklist for the whole of life. Placing each inside a space also settles who sees it, so a private Health area stays out of the family view.',
    writes: ['area'],
  },
  {
    id: 'brain-dump',
    title: 'Brain dump goals',
    minutes: 45,
    why: 'Get everything out before judging any of it.',
    you: 'Say every goal you can think of, area by area. Don\'t filter yet.',
    guide: 'Sorts each goal into its area. Points out an empty area; never fills it.',
    more: 'Judging while listing makes the list shorter and safer than what you actually want. A goal like "learn to sail" can sit next to "refinance the mortgage" for now, and the sorting comes later.',
    writes: ['plan_add', 'area'],
    choosing: true,
  },
  {
    id: 'refine',
    title: 'Refine the list',
    minutes: 30,
    why: 'A list you can actually carry for twelve months.',
    you: 'Keep, merge, or move to Someday until the list feels right to reread.',
    guide: 'Shows goals that overlap or repeat. You decide what happens to them.',
    more: 'A raw list usually has duplicates and a few ideas that can wait. Merging "exercise more" with "run a 10K" and moving "learn sailing" to Someday leaves a list you will actually want to reread in July.',
    writes: ['triage'],
  },
  {
    id: 'share-book',
    title: 'Share and book the next session',
    minutes: 10,
    why: 'Plans stick when the people affected know them and the next check-in is booked.',
    you: 'Choose what the family should see. Pick a date for the first season session.',
    guide: 'Moves shared goals to Family and puts the season session on the calendar.',
    more: 'A goal like "take a family trip" only works if the family knows about it. Booking the first season session now, while the year is fresh, means the plan gets revisited rather than forgotten by March.',
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

export function stepsFor(level: GuideLevel): readonly GuideStep[] {
  return GUIDE_STEPS[level]
}

export function choosingStep(level: GuideLevel): GuideStep {
  const step = GUIDE_STEPS[level].find(s => s.choosing)
  if (!step) throw new Error(`No choosing step for level ${level}`)
  return step
}
