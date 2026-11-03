// src/lib/planning/guideSheets.ts
//
// The printable planning guide: four sheets, one per horizon, as DATA so the
// page stays a renderer and the wording can be read and tested in one place.
//
// The sheets follow the app's Plan button, in its order (rewritten 2026-11-03
// against the plan-from-the-level-above flow of 2026-10-19 and the horizon
// strip of 2026-10-25):
//
//   1. This is       — which period, with its dates.
//   2. Looking back  — the period before: how much got done, what went well,
//                      what didn't, and a decision for each leftover.
//   3. Choose        — the level above written BESIDE this period's list, and
//                      each line saying what it is for.
//   4. Give them a day (week only) — the week's days, and No day yet.
//
// The rules the content follows:
//
//   · Each sheet works alone. None is a prerequisite for another, and the
//     Year sheet says so in as many words.
//   · Year, Season and Month hold goals; Week holds tasks. Above the week
//     nothing is sorted into kinds — no task / routine / event areas. The year
//     is a short list to look at, a season is a brainstorm, a month is a plain
//     list written with its season beside it. The week and the day are for
//     doing.
//   · A line is never given a day above the week. A step too big for the
//     period is broken down where it sits, not moved down whole.
//   · Individuals and families are equally valid at every horizon. The family
//     prompt is one small optional block, never a grid of per-person columns.
//   · Paper is an aid, not an import format. A blank is kept as a blank, and
//     nothing here has to be worded a particular way.
//   · A few goals are SUGGESTED. The lines are a suggestion, not a cap.
//   · Nothing promises importer behaviour that has not been verified.

export type GuideLevel = 'week' | 'month' | 'season' | 'year'

export type GuideBlock =
  /** Short labelled blanks on one row — "Week beginning", "Written by". */
  | { kind: 'fields'; fields: { label: string; span?: 1 | 2 | 3 }[] }
  /** Ruled writing lines, optionally with small trailing blanks. */
  | { kind: 'lines'; label?: string; hint?: string; count: number; tail?: string[] }
  /** Unruled space. Ruling it would make it a list, and a list reads as intent. */
  | { kind: 'open'; label: string; hint?: string; height: 'sm' | 'md' | 'lg' }
  /** A printed sentence, not a prompt — the sheet telling the truth about itself. */
  | { kind: 'note'; text: string }
  /**
   * The week's days as boxes, each headed by a blank for the day and date —
   * a household's week can start on Saturday, Sunday or Monday, so the sheet
   * does not print the names — then one more box for what has no day yet.
   */
  | { kind: 'days'; count: number; lines: number; last: string }

export interface GuideBand {
  title: string
  /** One sentence under the band heading. */
  lead?: string
  /** This horizon's own questions, printed above the writing space. */
  questions?: string[]
  /** Printed beside the heading, so skipping is visibly allowed. */
  optional?: boolean
  /**
   * The first block is the level above, written in a narrow column BESIDE the
   * rest — "a month is a plain list written with its season beside it".
   */
  beside?: boolean
  blocks: GuideBlock[]
}

export interface GuideSheet {
  level: GuideLevel
  /** The page heading, e.g. "The week sheet". */
  title: string
  /** One line on the sheet saying what it is for. */
  lead: string
  /** Roughly how long it takes, printed on the sheet. */
  minutes: number
  /**
   * How many SIDES of paper this actually prints on, stated on the sheet and
   * on the page. "Four sheets" meant twelve printed sides and nobody was told
   * (Codex review, 2026-09-24), so the number is part of the content and the
   * print check asserts it against what Chromium really produces.
   */
  sides: 1 | 2 | 3
  bands: GuideBand[]
}

const SIDES = ['', 'One side', 'Two sides', 'Three sides'] as const
export function sidesLabel(sheet: GuideSheet): string { return SIDES[sheet.sides] }

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/** "seven sides" — the total the page states, computed so it cannot drift. */
export function totalSidesLabel(): string {
  const n = GUIDE_SHEETS.reduce((sum, s) => sum + s.sides, 0)
  return `${NUMBER_WORDS[n] ?? n} side${n === 1 ? '' : 's'}`
}

const KEEP_BLANK = 'Leave anything you do not know yet blank. A blank is kept as a blank.'
const NOT_A_LIMIT = 'A few is the suggestion, not the limit — carry on below the lines if you need to.'

/**
 * Band 1, in this horizon's own words. A week and a month are dates; a season
 * is whatever you call it, with the dates it runs between.
 */
function thisIs(fields: { label: string; span?: 1 | 2 | 3 }[], lead: string, note = true): GuideBand {
  return {
    title: 'This is',
    lead,
    blocks: [
      { kind: 'fields', fields: [...fields, { label: 'Written by', span: 2 }] },
      ...(note ? [{ kind: 'note' as const, text: 'If you leave this blank the sheet is still useful — you will just be asked which period it belongs to.' }] : []),
    ],
  }
}

/**
 * Band 2: the app's Looking back card. One number, what went well, what
 * didn't, and a decision for each leftover — so carrying something forward is
 * a choice rather than a default. Skippable, and never a score.
 */
function lookingBack(before: string, carry: string, extra?: string, roomy = false): GuideBand {
  return {
    title: 'Looking back',
    optional: true,
    lead: `${before}, before choosing anything new. No scoring.`,
    blocks: [
      { kind: 'fields', fields: [{ label: 'Done' }, { label: 'out of' }] },
      { kind: 'lines', label: 'What went well', count: roomy ? 4 : 2 },
      { kind: 'lines', label: 'What didn’t', count: roomy ? 4 : 2 },
      { kind: 'lines', label: `From ${before.toLowerCase()}, not done`, hint: carry, count: roomy ? 6 : 3, tail: ['now'] },
      ...(extra ? [{ kind: 'lines' as const, label: extra, count: roomy ? 6 : 2 }] : []),
    ],
  }
}

/** The one family prompt. Small, optional, and never a grid of columns. */
function together(): GuideBand {
  return {
    title: 'If more than one of you is filling this in',
    optional: true,
    lead: 'A few lines, not a column each.',
    blocks: [
      { kind: 'lines', label: 'What each person wants from this stretch', count: 3 },
      { kind: 'lines', label: 'Who has agreed to take which goal', hint: 'agreed, not assigned', count: 2 },
    ],
  }
}

export const GUIDE_SHEETS: readonly GuideSheet[] = [
  {
    level: 'week',
    // Deliberately the shortest of the four: one side, at the same type as the
    // rest. A week's exercise that runs to three sides is not a week's
    // exercise (Codex review, 2026-09-24).
    title: 'The week sheet',
    lead: 'The one to start with if you only ever use one. The week is for doing.',
    minutes: 10,
    sides: 1,
    bands: [
      thisIs([{ label: 'Week beginning (day and date)', span: 2 }], '', false),
      {
        title: 'Looking back',
        optional: true,
        blocks: [
          { kind: 'fields', fields: [{ label: 'Last week: done' }, { label: 'out of' }] },
          { kind: 'lines', label: 'Went well · didn’t', count: 2 },
          { kind: 'lines', label: 'From last week, not done', hint: 'beside each: this week, back to the month, or let go', count: 2, tail: ['now'] },
        ],
      },
      {
        title: 'Choose from the month',
        beside: true,
        lead: 'The month’s goals on the left; this week’s tasks, toward them or not, on the right.',
        blocks: [
          { kind: 'lines', label: 'The month’s goals', count: 4 },
          { kind: 'lines', label: 'This week’s tasks', hint: '“for” is the goal it serves; often blank', count: 4, tail: ['for'] },
          // The family prompt as one line rather than a band of its own: the
          // week sheet is one side, and a heading costs as much as two lines.
          { kind: 'lines', label: 'If more than one of you: who has agreed to take which task', count: 1 },
          { kind: 'note', text: 'A goal stays on the month; the week gets a task toward it. A blank is kept as a blank.' },
        ],
      },
      {
        title: 'Give them a day',
        lead: 'Write the day and date at the top of each box. Fixed times and the week’s routines go on their day; what can be done any day stays in No day yet.',
        blocks: [{ kind: 'days', count: 7, lines: 3, last: 'No day yet' }],
      },
    ],
  },
  {
    level: 'month',
    title: 'The month sheet',
    lead: 'Once a month, in about a quarter of an hour. A plain list of goals, written with its season beside it — and it works whether or not you ever fill in a season sheet.',
    minutes: 15,
    sides: 2,
    bands: [
      thisIs(
        [{ label: 'Month', span: 2 }, { label: 'Year' }],
        'The month and the year.',
      ),
      lookingBack('Last month', 'beside each: this month, back to the season, or let go', 'What I now know that I didn’t at the start', true),
      {
        title: 'Choose from the season',
        beside: true,
        lead: 'Copy the season’s list on the left. On the right, this month’s goals — what you want to be true by the end of the month.',
        questions: [
          'What progress would actually matter by the end of the month?',
          'What dates or constraints shape it?',
          'What should wait for another month?',
        ],
        blocks: [
          { kind: 'lines', label: 'The season’s list', count: 10 },
          { kind: 'lines', label: 'This month’s goals', hint: '“for” is the season line it serves; often blank', count: 9, tail: ['for'] },
          { kind: 'note', text: `${NOT_A_LIMIT} A goal never gets a day; its tasks go on a week. Too big for one month? Write a smaller piece under it and plan that.` },
          { kind: 'lines', label: 'If only one of these happens, which one?', count: 1 },
          { kind: 'note', text: KEEP_BLANK },
        ],
      },
      together(),
    ],
  },
  {
    level: 'season',
    title: 'The season sheet',
    lead: 'Four times a year, in about twenty-five minutes. A season is a brainstorm list — whatever stretch you actually live in, and it does not have to be a quarter.',
    minutes: 25,
    sides: 2,
    bands: [
      thisIs(
        [{ label: 'Season', span: 2 }, { label: 'From' }, { label: 'To' }],
        'Name the season the way you think of it — “Fall”, “the school term” — and the dates it runs between.',
      ),
      lookingBack('Last season', 'beside each: this season, back to the year, or let go', 'What I now know that I didn’t at the start', true),
      {
        title: 'Choose from the year',
        beside: true,
        lead: 'Copy the year’s goals on the left. On the right, brainstorm: everything this season might hold, in any order.',
        questions: [
          'What changed since the last season?',
          'What transitions or commitments are coming?',
          'What can the first month realistically advance?',
        ],
        blocks: [
          { kind: 'lines', label: 'The year’s goals', count: 8 },
          { kind: 'lines', label: 'This season’s list', hint: '“for” is the year goal; “month” is when to start it — both often blank', count: 13, tail: ['for', 'month'] },
          { kind: 'note', text: `A brainstorm is not a promise: a line here is something to look at, and becomes work only when a month or a week takes it. ${NOT_A_LIMIT}` },
          { kind: 'note', text: KEEP_BLANK },
        ],
      },
      together(),
    ],
  },
  {
    level: 'year',
    title: 'The year sheet',
    lead: 'Once, in about half an hour. Nothing above it is required — a person who only ever fills in the week sheet is using this guide correctly.',
    minutes: 30,
    sides: 2,
    bands: [
      thisIs([{ label: 'Year', span: 2 }], 'The year.'),
      lookingBack('Last year', 'beside each: carry it into this year, or let it go', 'What I now know that I didn’t at the start'),
      {
        title: 'This year’s goals',
        lead: 'A short list to look at all year — a reference, not a to-do list. Write outcomes, not errands.',
        questions: [
          'What direction matters this year?',
          'What major dates or transitions are already known?',
          'What would meaningful progress look like?',
        ],
        blocks: [
          { kind: 'lines', count: 6, tail: ['season'] },
          { kind: 'note', text: `${NOT_A_LIMIT} “Season” is the one to start it in, and can stay blank until you know.` },
          { kind: 'lines', label: 'If only one of these happens, which one?', count: 1 },
          { kind: 'note', text: KEEP_BLANK },
        ],
      },
      {
        title: 'Anything, in any order',
        optional: true,
        lead: 'Unruled on purpose. Nothing here is a goal unless you copy it into the list above.',
        blocks: [{ kind: 'open', label: '', height: 'lg' }],
      },
      together(),
    ],
  },
]

export function sheetFor(level: GuideLevel): GuideSheet {
  const sheet = GUIDE_SHEETS.find((s) => s.level === level)
  if (!sheet) throw new Error(`no guide sheet for "${level}"`)
  return sheet
}
