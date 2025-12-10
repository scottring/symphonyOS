import { describe, it, expect } from 'vitest'
import { parseQuickInput, hasParsedFields } from './quickInputParser'

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

  it('handles partial project name matches', () => {
    const result = parseQuickInput('review code #work', mockContext)
    expect(result.projectId).toBe('p2')
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
