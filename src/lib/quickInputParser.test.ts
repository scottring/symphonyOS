import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseQuickInput, hasParsedFields, allDayFromParse } from './quickInputParser'

const mockContext = {
  projects: [
    { id: 'p1', name: 'Montreal Trip' },
    { id: 'p2', name: 'Work Stuff' },
    { id: 'p3', name: 'Symphony OS' },
  ],
  contacts: [
    { id: 'c1', name: 'Iris' },
    { id: 'c2', name: 'Dr. Smith' },
  ],
}

describe('parseQuickInput', () => {
  it('returns raw text as title when nothing matches', () => {
    const result = parseQuickInput('random thought', mockContext)
    expect(result.title).toBe('random thought')
    expect(result.rawText).toBe('random thought')
    expect(hasParsedFields(result)).toBe(false)
  })

  it('parses "tomorrow" as due date', () => {
    const result = parseQuickInput('buy milk tomorrow', mockContext)
    expect(result.title).toBe('buy milk')
    expect(result.dueDate).toBeDefined()
    expect(result.dueDateMatch).toBe('tomorrow')
  })

  it('parses "next monday" as due date', () => {
    const result = parseQuickInput('call dentist next monday', mockContext)
    expect(result.title).toBe('call dentist')
    expect(result.dueDate).toBeDefined()
  })

  it('matches project with #hashtag', () => {
    const result = parseQuickInput('book flights #montreal', mockContext)
    expect(result.title).toBe('book flights')
    expect(result.projectId).toBe('p1')
    expect(result.projectMatch).toBe('#montreal')
  })

  it('matches project with "in Project"', () => {
    const result = parseQuickInput('buy tickets in montreal trip', mockContext)
    expect(result.title).toBe('buy tickets')
    expect(result.projectId).toBe('p1')
  })

  it('matches project with "for Project"', () => {
    const result = parseQuickInput('fix bug for symphony', mockContext)
    expect(result.title).toBe('fix bug')
    expect(result.projectId).toBe('p3')
  })

  it('matches contact with @mention', () => {
    const result = parseQuickInput('call @iris about dinner', mockContext)
    expect(result.contactId).toBe('c1')
  })

  it('matches contact with "with Contact"', () => {
    const result = parseQuickInput('appointment with dr smith', mockContext)
    expect(result.title).toBe('appointment')
    expect(result.contactId).toBe('c2')
  })

  it('parses multiple fields together', () => {
    const result = parseQuickInput(
      'book hotel for montreal trip tomorrow with iris',
      mockContext
    )
    expect(result.title).toBe('book hotel')
    expect(result.projectId).toBe('p1')
    expect(result.contactId).toBe('c1')
    expect(result.dueDate).toBeDefined()
  })

  it('preserves original text in rawText', () => {
    const input = 'complex task #montreal tomorrow @iris'
    const result = parseQuickInput(input, mockContext)
    expect(result.rawText).toBe(input)
  })

  it('handles empty input gracefully', () => {
    const result = parseQuickInput('', mockContext)
    expect(result.title).toBe('')
    expect(result.rawText).toBe('')
  })

  it('detects urgent priority', () => {
    const result = parseQuickInput('fix critical bug urgent', mockContext)
    expect(result.priority).toBe('high')
    expect(result.title).toBe('fix critical bug')
  })

  it('detects !! as high priority', () => {
    const result = parseQuickInput('fix bug !!', mockContext)
    expect(result.priority).toBe('high')
    expect(result.title).toBe('fix bug')
  })

  // Was "#work" -> "Work Stuff". The domain ids are reserved tokens now (see
  // the "explicit domain tokens" block below), so a partial project match has
  // to be tested with a word that isn't a domain.
  it('handles partial project name matches', () => {
    const result = parseQuickInput('review code #symphony', mockContext)
    expect(result.projectId).toBe('p3')
  })

  it('handles case insensitive matching', () => {
    const result = parseQuickInput('call @IRIS', mockContext)
    expect(result.contactId).toBe('c1')
  })

  it('returns hasParsedFields true when fields are parsed', () => {
    const result = parseQuickInput('task tomorrow', mockContext)
    expect(hasParsedFields(result)).toBe(true)
  })

  it('does not match non-existent projects', () => {
    const result = parseQuickInput('task #nonexistent', mockContext)
    expect(result.projectId).toBeUndefined()
    expect(result.title).toBe('task #nonexistent')
  })

  it('does not match non-existent contacts', () => {
    const result = parseQuickInput('call @unknown', mockContext)
    expect(result.contactId).toBeUndefined()
    expect(result.title).toBe('call @unknown')
  })
})

describe('ambiguous bare date keywords (topic words, not scheduling)', () => {
  it('does NOT schedule on a bare "weekend" and keeps the title intact', () => {
    // The reported bug: "text karen walker re weekend" got rescheduled to Sat
    // and lost the word "weekend" from the title.
    const result = parseQuickInput('text karen walker re weekend', mockContext)
    expect(result.dueDate).toBeUndefined()
    expect(result.title).toBe('text karen walker re weekend')
  })

  it('does NOT schedule on a bare month name ("May invoices")', () => {
    const result = parseQuickInput('May invoices', mockContext)
    expect(result.dueDate).toBeUndefined()
    expect(result.title).toBe('May invoices')
  })

  it('still parses "tomorrow" (unambiguous relative date)', () => {
    const result = parseQuickInput('call mom tomorrow', mockContext)
    expect(result.dueDate).toBeDefined()
    expect(result.title).toBe('call mom')
  })

  it('still parses a weekend WITH a cue ("this weekend")', () => {
    const result = parseQuickInput('clean garage this weekend', mockContext)
    expect(result.dueDate).toBeDefined()
  })

  it('still parses a weekday with an explicit time ("next friday 1pm")', () => {
    const result = parseQuickInput('lunch next friday 1pm', mockContext)
    expect(result.dueDate).toBeDefined()
  })

  it('still parses a month WITH a day number ("May 15")', () => {
    const result = parseQuickInput('pay rent May 15', mockContext)
    expect(result.dueDate).toBeDefined()
  })
})

describe('category prefix parsing', () => {
  it('parses event: prefix', () => {
    const result = parseQuickInput('event: dentist tomorrow', mockContext)
    expect(result.category).toBe('event')
    expect(result.title).toBe('dentist')
    expect(result.dueDate).toBeDefined()
  })

  it('parses errand: prefix', () => {
    const result = parseQuickInput('errand: pick up dry cleaning', mockContext)
    expect(result.category).toBe('errand')
    expect(result.title).toBe('pick up dry cleaning')
  })

  it('parses chore: prefix', () => {
    const result = parseQuickInput('chore: take out trash', mockContext)
    expect(result.category).toBe('chore')
    expect(result.title).toBe('take out trash')
  })

  it('parses activity: prefix', () => {
    const result = parseQuickInput('activity: soccer practice', mockContext)
    expect(result.category).toBe('activity')
    expect(result.title).toBe('soccer practice')
  })

  it('parses task: prefix', () => {
    const result = parseQuickInput('task: review code', mockContext)
    expect(result.category).toBe('task')
    expect(result.title).toBe('review code')
  })

  it('hw: and homework: prefixes set the homework category', () => {
    expect(parseQuickInput('hw: return blue sheet', mockContext).category).toBe('homework')
    expect(parseQuickInput('homework: reading log', mockContext).category).toBe('homework')
    expect(parseQuickInput('hw: return blue sheet', mockContext).title).toBe('return blue sheet')
  })

  it('parses short aliases (er:, ev:, ch:, act:)', () => {
    expect(parseQuickInput('er: groceries', mockContext).category).toBe('errand')
    expect(parseQuickInput('ev: meeting', mockContext).category).toBe('event')
    expect(parseQuickInput('ch: dishes', mockContext).category).toBe('chore')
    expect(parseQuickInput('act: piano', mockContext).category).toBe('activity')
  })

  it('is case insensitive', () => {
    const result = parseQuickInput('EVENT: birthday party', mockContext)
    expect(result.category).toBe('event')
    expect(result.title).toBe('birthday party')
  })

  it('combines with other parsed fields', () => {
    const result = parseQuickInput('errand: pick up cake tomorrow #montreal', mockContext)
    expect(result.category).toBe('errand')
    expect(result.title).toBe('pick up cake')
    expect(result.dueDate).toBeDefined()
    expect(result.projectId).toBe('p1')
  })

  it('does not match prefix in middle of text', () => {
    const result = parseQuickInput('buy event: tickets', mockContext)
    expect(result.category).toBeUndefined()
  })

  it('preserves categoryMatch for matched prefix', () => {
    const result = parseQuickInput('Event: dentist', mockContext)
    expect(result.categoryMatch).toBe('Event:')
  })

  it('hasParsedFields returns true when category is parsed', () => {
    const result = parseQuickInput('errand: groceries', mockContext)
    expect(hasParsedFields(result)).toBe(true)
  })

  it('works without space after colon', () => {
    const result = parseQuickInput('errand:pick up milk', mockContext)
    expect(result.category).toBe('errand')
    expect(result.title).toBe('pick up milk')
  })

  it('handles time with colon after category prefix', () => {
    const result = parseQuickInput('event: meeting at 2:30pm', mockContext)
    expect(result.category).toBe('event')
    expect(result.title).toBe('meeting')
    expect(result.dueDate).toBeDefined()
  })
})

describe('duration parsing', () => {
  it('parses "45m" as a 45-minute duration and strips it from the title', () => {
    const result = parseQuickInput('event: dentist thursday 2pm 45m', mockContext)
    expect(result.category).toBe('event')
    expect(result.durationMinutes).toBe(45)
    expect(result.dueDate).toBeDefined()
    expect(result.title).toBe('dentist')
  })

  it('parses "for 45 minutes"', () => {
    const result = parseQuickInput('standup tomorrow 9am for 45 minutes', mockContext)
    expect(result.durationMinutes).toBe(45)
    expect(result.title).toBe('standup')
  })

  it('parses hour forms: "2h", "1.5h", "1h30m"', () => {
    expect(parseQuickInput('deep work 2h tomorrow', mockContext).durationMinutes).toBe(120)
    expect(parseQuickInput('deep work 1.5h tomorrow', mockContext).durationMinutes).toBe(90)
    expect(parseQuickInput('deep work 1h30m tomorrow', mockContext).durationMinutes).toBe(90)
  })

  it('does NOT treat "in 45 minutes" as a duration (relative time belongs to chrono)', () => {
    const result = parseQuickInput('call vet in 45 minutes', mockContext)
    expect(result.durationMinutes).toBeUndefined()
    expect(result.dueDate).toBeDefined()
  })

  it('does not confuse clock times or unit words with durations', () => {
    const r1 = parseQuickInput('meeting at 2pm', mockContext)
    expect(r1.durationMinutes).toBeUndefined()
    const r2 = parseQuickInput('run 45 miles someday', mockContext)
    expect(r2.durationMinutes).toBeUndefined()
    const r3 = parseQuickInput('vitamin d 500 mg daily', mockContext)
    expect(r3.durationMinutes).toBeUndefined()
  })

  it('derives duration from a chrono time range', () => {
    const result = parseQuickInput('dentist thursday 2pm-3:30pm', mockContext)
    expect(result.durationMinutes).toBe(90)
  })

  it('hasParsedFields counts duration as a field', () => {
    const result = parseQuickInput('mow lawn 30m', mockContext)
    expect(result.durationMinutes).toBe(30)
    expect(hasParsedFields(result)).toBe(true)
  })
})

// ── Time resolution ─────────────────────────────────────────────────────────
// The 2026-09-04 launch rehearsal's two trust failures, pinned. Both run
// against a fixed "now" (Friday 2026-09-04 09:00 local) because both bugs are
// relative to the current day and weekday.
describe('time resolution (bare hours and backward weekdays)', () => {
  const NOW = new Date(2026, 8, 4, 9, 0, 0) // Friday 4 Sept 2026, 09:00 local

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads a bare evening hour as PM, not AM', () => {
    const r = parseQuickInput('Pick up Michael from soccer at 6', mockContext)
    expect(r.dueDate?.getHours()).toBe(18)
    expect(r.dueDate?.getDate()).toBe(4) // still today
  })

  it('reads "at 5:30" as PM and keeps the minutes', () => {
    const r = parseQuickInput('pickup at 5:30', mockContext)
    expect(r.dueDate?.getHours()).toBe(17)
    expect(r.dueDate?.getMinutes()).toBe(30)
  })

  it('leaves a bare morning hour alone (7+ is genuinely ambiguous)', () => {
    const r = parseQuickInput('standup at 9', mockContext)
    expect(r.dueDate?.getHours()).toBe(9)
  })

  it('never resolves a bare weekday into the past', () => {
    // "thu" typed on a Friday used to land on YESTERDAY, arriving overdue.
    const r = parseQuickInput('dentist thu 2pm', mockContext)
    expect(r.dueDate!.getTime()).toBeGreaterThan(NOW.getTime())
    expect(r.dueDate?.getDay()).toBe(4) // Thursday
    expect(r.dueDate?.getHours()).toBe(14)
  })

  it('does not roll an explicit past date forward', () => {
    // "yesterday" is deliberate — logging something that already happened.
    const r = parseQuickInput('call mom yesterday', mockContext)
    expect(r.dueDate?.getDate()).toBe(3)
    expect(r.dueDate!.getTime()).toBeLessThan(NOW.getTime())
  })

  it('does not push a named calendar date into next year', () => {
    const r = parseQuickInput('sept 1 review', mockContext)
    expect(r.dueDate?.getFullYear()).toBe(2026)
    expect(r.dueDate?.getMonth()).toBe(8)
    expect(r.dueDate?.getDate()).toBe(1)
  })

  it('respects an explicit meridiem over the PM heuristic', () => {
    const r = parseQuickInput('flight at 6am', mockContext)
    expect(r.dueDate?.getHours()).toBe(6)
  })

  it('keeps an explicit duration alongside a corrected weekday', () => {
    const r = parseQuickInput('dentist thu 2pm 45m', mockContext)
    expect(r.durationMinutes).toBe(45)
    expect(r.dueDate!.getTime()).toBeGreaterThan(NOW.getTime())
  })
})

describe('explicit domain tokens', () => {
  it('stamps context from #work and strips the token from the title', () => {
    const r = parseQuickInput('email the auditor #work', mockContext)
    expect(r.context).toBe('work')
    expect(r.contextMatch).toBe('#work')
    expect(r.title).toBe('email the auditor')
  })

  it('stamps #family and #personal', () => {
    expect(parseQuickInput('school forms #family', mockContext).context).toBe('family')
    expect(parseQuickInput('book haircut #personal', mockContext).context).toBe('personal')
  })

  it('matches the token anywhere in the line, case-insensitively', () => {
    const r = parseQuickInput('#Work draft the deck', mockContext)
    expect(r.context).toBe('work')
    expect(r.title).toBe('draft the deck')
  })

  // The domain tokens are RESERVED: mockContext has a project literally called
  // "Work Stuff", which the #project pattern would otherwise fuzzy-match.
  it('wins over a project whose name shares the domain word', () => {
    const r = parseQuickInput('email the auditor #work', mockContext)
    expect(r.context).toBe('work')
    expect(r.projectId).toBeUndefined()
  })

  it('leaves a longer word starting with a domain id alone', () => {
    const r = parseQuickInput('sign up for #workout class', mockContext)
    expect(r.context).toBeUndefined()
    expect(r.title).toContain('#workout')
  })

  it('coexists with the other parsed fields', () => {
    const r = parseQuickInput('call the plumber tomorrow #family', mockContext)
    expect(r.context).toBe('family')
    expect(r.dueDate).toBeDefined()
    expect(r.title).toBe('call the plumber')
  })

  it('counts as a parsed field on its own', () => {
    expect(hasParsedFields(parseQuickInput('pay the invoice #work', mockContext))).toBe(true)
  })
})

// ── Dangling preposition + hasTime (A2.7) ───────────────────────────────────
// "Finish the deck for Monday" used to become "Finish the deck for" — chrono
// only strips the date text ("Monday"), leaving the preposition that
// introduced it stranded at the end of the title.
describe('dangling preposition and hasTime', () => {
  const ctx = mockContext

  it('"Finish the deck for Monday" → title without the dangling for, no time', () => {
    const r = parseQuickInput('Finish the deck for Monday', ctx)
    expect(r.title).toBe('Finish the deck')
    expect(r.hasTime).toBe(false)
    expect(r.dueDate?.getHours()).toBe(0)
  })

  it('"Dentist thu 2pm" keeps the time', () => {
    expect(parseQuickInput('Dentist thu 2pm', ctx).hasTime).toBe(true)
  })
})


// The all-day rule, in one place — three quick-add call sites read it, and
// getting it wrong is invisible: a task filed timed with a zeroed time shows
// as a 12:00 AM block instead of a chip on the day.
describe('allDayFromParse', () => {
  const ctx = mockContext
  it('a bare date is ALL-DAY — the parser zeroed its time, that is not midnight', () => {
    const p = parseQuickInput('Finish the deck for Monday', ctx)
    expect(p.dueDate).toBeInstanceOf(Date)
    expect(p.hasTime).toBe(false)
    expect(allDayFromParse(p)).toBe(true)
  })

  it('a named clock time is a real block, not all-day', () => {
    const p = parseQuickInput('Dentist thu 2pm', ctx)
    expect(p.hasTime).toBe(true)
    expect(allDayFromParse(p)).toBe(false)
  })

  it('no date at all leaves the choice to the caller', () => {
    expect(allDayFromParse(parseQuickInput('Call mom', ctx))).toBeUndefined()
  })
})
