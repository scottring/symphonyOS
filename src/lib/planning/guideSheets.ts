// src/lib/planning/guideSheets.ts
//
// The printable planning guide: four sheets, one per horizon, as DATA so the
// page stays a renderer and the wording can be read and tested in one place.
//
// The rules the content follows (Codex's guide review, 2026-09-24):
//
//   · Each sheet works alone. None is a prerequisite for another, and the
//     Year sheet says so in as many words.
//   · Individuals and families are equally valid at every horizon. The family
//     prompt is one small optional block, never a grid of cramped per-person
//     columns.
//   · Paper is an aid, not an import format. A blank is kept as a blank, an
//     ordinary notebook is welcome, and nothing here has to be worded a
//     particular way.
//   · A few priorities are SUGGESTED. The lines are a suggestion, not a cap.
//   · An undecided idea and an actionable task without a date are different
//     things, and the sheet keeps them apart by position rather than wording.
//   · Nothing promises importer behaviour that has not been verified.
//
// Position carries the classification: which printed area a line sits in is
// the signal, and the printed glyph is a second one for when handwriting
// crosses a boundary.

export type GuideLevel = 'week' | 'month' | 'season' | 'year'

export type GuideBlock =
  /** Short labelled blanks on one row — "Week beginning", "Written by". */
  | { kind: 'fields'; fields: { label: string; span?: 1 | 2 | 3 }[] }
  /** Ruled writing lines, optionally glyphed and with small trailing blanks. */
  | { kind: 'lines'; label?: string; hint?: string; count: number; glyph?: string; tail?: string[] }
  /** Unruled space. Ruling it would make it a list, and a list reads as intent. */
  | { kind: 'open'; label: string; hint?: string; height: 'sm' | 'md' | 'lg' }
  /** A printed sentence, not a prompt — the sheet telling the truth about itself. */
  | { kind: 'note'; text: string }

export interface GuideBand {
  title: string
  /** One sentence under the band heading. */
  lead?: string
  /** This horizon's own questions, printed above the writing space. */
  questions?: string[]
  /** Printed beside the heading, so skipping is visibly allowed. */
  optional?: boolean
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

const KEEP_BLANK = 'Leave anything you do not know yet blank. A blank is kept as a blank.'

/**
 * Band 1, in this horizon's own words. A week and a month are dates; a season
 * is whatever you call it. "Write the season in digits" was nonsense, and the
 * year sheet asked for the year twice (Codex review, 2026-09-24).
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

/** Band 2. Factual, short, and explicitly skippable on every sheet. */
function whatHappened(extra?: string): GuideBand {
  return {
    title: 'What happened',
    optional: true,
    lead: 'A look-back, so the carry-forward is a decision rather than a default. No scoring.',
    blocks: [
      { kind: 'lines', label: 'Done, and worth recording', count: 2 },
      { kind: 'lines', label: 'Carried, and still wanted', count: 2 },
      { kind: 'lines', label: 'Let go', count: 2 },
      ...(extra ? [{ kind: 'lines' as const, label: extra, count: 2 }] : []),
    ],
  }
}

/** Band 3. What the period already holds, written down before anything new. */
function alreadyCommitted(periodNoun: string): GuideBand {
  return {
    title: 'What is already committed',
    lead: `Before choosing anything new, write down what the ${periodNoun} already holds.`,
    blocks: [
      { kind: 'lines', label: 'Already on the calendar', hint: 'fixed dates, and other people’s dates', count: 3 },
      { kind: 'lines', label: 'Already repeating', hint: 'things that happen anyway', count: 2 },
      {
        kind: 'lines',
        label: `Realistically, the room I have for anything new this ${periodNoun} is`,
        hint: 'in your own units — “two evenings”, “one Saturday”, “almost none”',
        count: 1,
      },
    ],
  }
}

/** Band 5. The same four printed areas on every sheet, in the same order. */
function whatThatMeans(): GuideBand {
  return {
    title: 'What that means',
    lead: 'Which area a line is written in is the signal. Nothing has to be worded a particular way.',
    blocks: [
      {
        kind: 'lines', glyph: '☐', label: 'Next actions',
        hint: 'one thing you could sit down and do — neither a date nor an owner is required',
        count: 4, tail: ['who', 'when'],
      },
      {
        kind: 'lines', glyph: '↻', label: 'Happens repeatedly',
        hint: 'a pattern, not a single occasion',
        count: 2, tail: ['how often', 'who'],
      },
      {
        kind: 'lines', glyph: '▣', label: 'Fixed date and time',
        hint: 'already set, or set by someone else',
        count: 2, tail: ['date', 'time'],
      },
      {
        kind: 'lines', glyph: '○', label: 'Not yet decided',
        hint: 'worth keeping, not committed to — nothing written here becomes a commitment',
        count: 4,
      },
      { kind: 'note', text: KEEP_BLANK },
    ],
  }
}

/**
 * The week's version: the same four areas, fewer lines and no second helping
 * of prose, so the sheet is one side at readable type rather than three at
 * 8pt (Codex review, 2026-09-24).
 */
function whatThatMeansBriefly(): GuideBand {
  return {
    title: 'What that means',
    lead: 'Which area a line is written in is the signal.',
    blocks: [
      { kind: 'lines', glyph: '☐', label: 'Next actions', hint: 'no date or owner required', count: 3, tail: ['who', 'when'] },
      { kind: 'lines', glyph: '↻', label: 'Happens repeatedly', count: 2, tail: ['how often'] },
      { kind: 'lines', glyph: '▣', label: 'Fixed date and time', count: 2, tail: ['date', 'time'] },
      { kind: 'lines', glyph: '○', label: 'Not yet decided', hint: 'not a commitment', count: 2 },
      { kind: 'note', text: KEEP_BLANK },
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
      { kind: 'lines', label: 'What you hold together', count: 2 },
      { kind: 'lines', label: 'Who has agreed to take the next action', hint: 'agreed, not assigned', count: 2 },
    ],
  }
}

/** Band 4, with this horizon's own questions above the lines. */
function whatMatters(questions: string[], count: number, noun: string): GuideBand {
  return {
    title: 'What matters here',
    lead: `By the end of this ${noun}, what do you want to be true? Write outcomes, not errands.`,
    questions,
    blocks: [
      { kind: 'lines', count, tail: ['supports'] },
      { kind: 'note', text: 'A few is the suggestion, not the limit — carry on below the lines if you need to. “Supports” is for naming a bigger thing in plain words, and is usually left blank.' },
      { kind: 'lines', label: 'If only one of these happens, which one?', count: 1 },
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
    lead: 'The one to start with if you only ever use one.',
    minutes: 10,
    sides: 1,
    bands: [
      // No lead and no note: on a one-side sheet the field label carries it,
      // and the guide page says the rest.
      thisIs([{ label: 'Week beginning (date)', span: 2 }], '', false),
      {
        title: 'What the week already holds',
        blocks: [
          { kind: 'lines', label: 'Already fixed', hint: 'dates, and other people’s', count: 2 },
          { kind: 'lines', label: 'Already repeating', count: 1 },
          { kind: 'lines', label: 'Still unfinished, and still wanted', count: 2 },
          { kind: 'lines', label: 'Room I actually have this week', count: 1 },
        ],
      },
      {
        title: 'What matters here',
        questions: [
          'Given that, which actions belong to this week?',
          'Which of them can sit in the week without a day?',
        ],
        blocks: [
          { kind: 'lines', count: 2, tail: ['supports'] },
          // The family prompt as one line rather than a band of its own: the
          // week sheet is one side, and a heading costs as much as two lines.
          { kind: 'lines', label: 'If more than one of you: who has agreed to take the next action', count: 1 },
          { kind: 'note', text: 'Two is a suggestion, not a limit. “Supports” is usually left blank.' },
        ],
      },
      whatThatMeansBriefly(),
    ],
  },
  {
    level: 'month',
    title: 'The month sheet',
    lead: 'Once a month, in about a quarter of an hour. It works whether or not you ever fill in a season sheet.',
    minutes: 15,
    sides: 2,
    bands: [
      thisIs(
        [{ label: 'Month', span: 2 }, { label: 'Year' }],
        'The month and the year, in digits.',
      ),
      whatHappened(),
      alreadyCommitted('month'),
      whatMatters([
        'What progress would actually matter by the end of the month?',
        'What dates or constraints shape it?',
        'What is the first action for each thing you chose?',
        'What should wait?',
      ], 3, 'month'),
      whatThatMeans(),
      together(),
    ],
  },
  {
    level: 'season',
    title: 'The season sheet',
    lead: 'Four times a year, in about half an hour. A season is whatever stretch you actually live in — it does not have to be a quarter.',
    minutes: 25,
    sides: 3,
    bands: [
      thisIs(
        [{ label: 'Season', span: 2 }, { label: 'Year' }],
        'Name the season the way you actually think of it — “autumn”, “Sep–Dec”, “the term” — and give the year.',
      ),
      whatHappened('What I now know that I didn’t at the start'),
      alreadyCommitted('season'),
      {
        title: 'Anything, in any order',
        optional: true,
        lead: 'Unruled on purpose. Nothing on this half-page is a commitment unless you copy it into a band below.',
        blocks: [{ kind: 'open', label: '', height: 'lg' }],
      },
      whatMatters([
        'What changed since the last season?',
        'What transitions or commitments are coming?',
        'Which few outcomes deserve attention?',
        'What can the first month realistically advance?',
      ], 3, 'season'),
      whatThatMeans(),
      together(),
    ],
  },
  {
    level: 'year',
    title: 'The year sheet',
    lead: 'Once, in about half an hour. Nothing above it is required — a person who only ever fills in the week sheet is using this guide correctly.',
    minutes: 30,
    sides: 3,
    bands: [
      thisIs([{ label: 'Year', span: 2 }], 'The year, in digits.'),
      whatHappened('What I now know that I didn’t at the start'),
      alreadyCommitted('year'),
      {
        title: 'Anything, in any order',
        optional: true,
        lead: 'Unruled on purpose. Nothing on this half-page is a commitment unless you copy it into a band below.',
        blocks: [{ kind: 'open', label: '', height: 'lg' }],
      },
      whatMatters([
        'What direction matters this year?',
        'What major dates or transitions are already known?',
        'What would meaningful progress look like?',
        'What belongs in the coming season, and what can stay open?',
      ], 3, 'year'),
      whatThatMeans(),
      together(),
    ],
  },
]

export function sheetFor(level: GuideLevel): GuideSheet {
  const sheet = GUIDE_SHEETS.find((s) => s.level === level)
  if (!sheet) throw new Error(`no guide sheet for "${level}"`)
  return sheet
}
