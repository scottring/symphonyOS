# Routine Parser Improvements

## Overview

The current routine natural language parser is too rigid. Users struggle to enter routines because it requires specific keyword patterns and strict time formats. This task makes the parser significantly smarter and more forgiving.

---

## Problems to Fix

| Issue | Current | Should Work |
|-------|---------|-------------|
| Days require "every" | `"every monday gym"` ✓ | `"monday gym"` ✓ |
| Time requires "at" | `"at 7pm"` ✓ | `"7pm"`, `"700p"`, `"7p"` ✓ |
| Time format strict | `"7:00pm"` ✓ | `"700p"`, `"7p"`, `"700"`, `"1930"` ✓ |
| Word order rigid | `"gym every monday at 7pm"` ✓ | `"7pm gym monday"`, `"gym monday 7pm"` ✓ |
| Pluralized days | ✗ | `"tuesdays"`, `"mondays and wednesdays"` ✓ |
| "on" prefix for days | ✗ | `"gym on monday"`, `"on tuesdays"` ✓ |
| No recurrence = daily | Might fail validation | `"take vitamins"` → daily ✓ |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/parseRoutine.ts` | Expand parsing patterns |
| `src/lib/parseRoutine.test.ts` | Add new test cases |

---

## Implementation

### 1. Expanded Time Parsing

Replace the current `timePatterns` array with much more flexible patterns:

```typescript
// Time parsing - MUCH more flexible
const timePatterns = [
  // Named times
  { regex: /\b(?:at\s+)?noon\b/i, parse: () => '12:00' },
  { regex: /\b(?:at\s+)?midnight\b/i, parse: () => '00:00' },
  
  // Military time: 1930, 0700, 1400
  { regex: /\b(\d{4})\b/, parse: (m: RegExpMatchArray) => {
    const num = m[1]
    const hours = parseInt(num.slice(0, 2), 10)
    const minutes = parseInt(num.slice(2), 10)
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }
    return null
  }},
  
  // Compact no-colon with meridiem: 700p, 700pm, 1130a, 1130am
  { regex: /\b(?:at\s+)?(\d{3,4})\s*(am?|pm?)\b/i, parse: (m: RegExpMatchArray) => {
    const num = m[1]
    const meridiem = m[2].toLowerCase()
    let hours: number
    let minutes: number
    
    if (num.length === 3) {
      // 700 = 7:00
      hours = parseInt(num[0], 10)
      minutes = parseInt(num.slice(1), 10)
    } else {
      // 1130 = 11:30
      hours = parseInt(num.slice(0, 2), 10)
      minutes = parseInt(num.slice(2), 10)
    }
    
    if (minutes > 59) return null
    
    if (meridiem.startsWith('p')) {
      if (hours !== 12) hours += 12
    } else if (hours === 12) {
      hours = 0
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }},
  
  // Standard with colon and meridiem: 7:30pm, 7:30 pm, at 7:30pm
  { regex: /\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am?|pm?)\b/i, parse: (m: RegExpMatchArray) => {
    let hours = parseInt(m[1], 10)
    const minutes = parseInt(m[2], 10)
    const meridiem = m[3].toLowerCase()
    if (meridiem.startsWith('p')) {
      if (hours !== 12) hours += 12
    } else if (hours === 12) {
      hours = 0
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }},
  
  // Just hour with meridiem: 7pm, 7p, 7 pm, at 7pm
  { regex: /\b(?:at\s+)?(\d{1,2})\s*(am?|pm?)\b/i, parse: (m: RegExpMatchArray) => {
    let hours = parseInt(m[1], 10)
    const meridiem = m[2].toLowerCase()
    if (meridiem.startsWith('p')) {
      if (hours !== 12) hours += 12
    } else if (hours === 12) {
      hours = 0
    }
    return `${hours.toString().padStart(2, '0')}:00`
  }},
  
  // "at 7" (assume AM for <=7, PM for 8-11, contextual)
  { regex: /\bat\s+(\d{1,2})\b(?!\s*:|\d)/i, parse: (m: RegExpMatchArray) => {
    const hours = parseInt(m[1], 10)
    // Heuristic: 1-6 likely AM, 7-11 could be either, 12+ PM
    // For now, just use the number as-is (24h logic)
    return `${hours.toString().padStart(2, '0')}:00`
  }},
]
```

### 2. Flexible Day Patterns (Without "every")

Add new patterns that don't require "every" prefix:

```typescript
// Add these to recurrence detection, AFTER checking for "every X" patterns

// Pattern: standalone days without "every"
// "monday wednesday gym" or "gym monday wednesday" or "trash tuesdays"
const standaloneDaysRegex = /\b((?:(?:sun|mon|tues?|wed(?:nes)?|thurs?|fri|sat)(?:day)?s?(?:\s*(?:,|and|&)\s*)?)+)\b/gi

// Find all day mentions in the input
const dayMatches = [...normalized.matchAll(standaloneDaysRegex)]
if (!recurrenceFound && dayMatches.length > 0) {
  const allDaysText = dayMatches.map(m => m[1]).join(' ').toLowerCase()
  const days: number[] = []
  
  // Map day names to numbers, handling plurals
  const dayMappings: Array<[RegExp, number]> = [
    [/\bsun(?:day)?s?\b/, 0],
    [/\bmon(?:day)?s?\b/, 1],
    [/\btues?(?:day)?s?\b/, 2],
    [/\bwed(?:nes)?(?:day)?s?\b/, 3],
    [/\bthurs?(?:day)?s?\b/, 4],
    [/\bfri(?:day)?s?\b/, 5],
    [/\bsat(?:urday)?s?\b/, 6],
  ]
  
  for (const [pattern, dayNum] of dayMappings) {
    if (pattern.test(allDaysText) && !days.includes(dayNum)) {
      days.push(dayNum)
    }
  }
  
  if (days.length > 0) {
    days.sort((a, b) => a - b)
    recurrence = { type: 'weekly', days }
    recurrenceFound = true
    
    // Mark these ranges as extracted for token building
    for (const match of dayMatches) {
      if (match.index !== undefined) {
        extractedRanges.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'day-pattern',
          text: getRecurrenceDisplay(recurrence),
        })
      }
    }
  }
}
```

### 3. Support "on [days]" Pattern

Add pattern for `"on monday"`, `"on tuesdays"`:

```typescript
// "on monday", "on tuesdays", "on monday and wednesday"
const onDaysRegex = /\bon\s+((?:(?:sun|mon|tues?|wed(?:nes)?|thurs?|fri|sat)(?:day)?s?(?:\s*(?:,|and|&)\s*)?)+)\b/i
const onDaysMatch = normalized.match(onDaysRegex)
if (!recurrenceFound && onDaysMatch && onDaysMatch.index !== undefined) {
  const daysText = onDaysMatch[1].toLowerCase()
  const days: number[] = []
  
  for (const [pattern, dayNum] of dayMappings) {
    if (pattern.test(daysText) && !days.includes(dayNum)) {
      days.push(dayNum)
    }
  }
  
  if (days.length > 0) {
    days.sort((a, b) => a - b)
    recurrence = { type: 'weekly', days }
    recurrenceFound = true
    extractedRanges.push({
      start: onDaysMatch.index,
      end: onDaysMatch.index + onDaysMatch[0].length,
      type: 'day-pattern',
      text: getRecurrenceDisplay(recurrence),
    })
  }
}
```

### 4. Better Default Handling

Ensure that inputs with no recurrence pattern default to daily and are still valid:

```typescript
// At the end of parsing, if no recurrence was found, default to daily
// This should already happen, but make it explicit:
if (!recurrenceFound) {
  recurrence = { type: 'daily' }
  // Don't add to extractedRanges - no text to highlight
}
```

Also verify `isValidParsedRoutine` only checks for non-empty action:

```typescript
export function isValidParsedRoutine(parsed: ParsedRoutine): boolean {
  // Valid if there's an action (the thing to do)
  // Recurrence defaults to daily, so that's always valid
  return parsed.action.trim().length > 0
}
```

### 5. Improved Action Extraction

The action should be everything that's NOT a recognized pattern. Clean it up better:

```typescript
// After extracting all patterns, build action from remaining text
// Also handle common connecting words that should be stripped

action = actionParts.join(' ')
  .replace(/\s+/g, ' ')           // Normalize whitespace
  .replace(/^[-–—]\s*/, '')       // Remove leading dashes
  .replace(/^\s*at\s*/i, '')      // Remove leading "at"
  .replace(/^\s*on\s*/i, '')      // Remove leading "on"  
  .replace(/^\s*every\s*/i, '')   // Remove orphaned "every"
  .replace(/\s+at\s*$/i, '')      // Remove trailing "at"
  .replace(/\s+on\s*$/i, '')      // Remove trailing "on"
  .trim()
```

---

## New Test Cases

Add these to `src/lib/parseRoutine.test.ts`:

```typescript
describe('flexible time parsing', () => {
  it('parses "700p" as 7:00 PM', () => {
    const result = parseRoutine('gym 700p')
    expect(result.time).toBe('19:00')
  })

  it('parses "700pm" as 7:00 PM', () => {
    const result = parseRoutine('gym 700pm')
    expect(result.time).toBe('19:00')
  })

  it('parses "7p" as 7:00 PM', () => {
    const result = parseRoutine('gym 7p')
    expect(result.time).toBe('19:00')
  })

  it('parses "1130a" as 11:30 AM', () => {
    const result = parseRoutine('meeting 1130a')
    expect(result.time).toBe('11:30')
  })

  it('parses "1130am" as 11:30 AM', () => {
    const result = parseRoutine('meeting 1130am')
    expect(result.time).toBe('11:30')
  })

  it('parses military time "1930"', () => {
    const result = parseRoutine('dinner 1930')
    expect(result.time).toBe('19:30')
  })

  it('parses military time "0700"', () => {
    const result = parseRoutine('wake up 0700')
    expect(result.time).toBe('07:00')
  })

  it('parses time without "at" keyword', () => {
    const result = parseRoutine('7pm gym')
    expect(result.time).toBe('19:00')
    expect(result.action).toBe('gym')
  })

  it('parses "12p" as noon', () => {
    const result = parseRoutine('lunch 12p')
    expect(result.time).toBe('12:00')
  })

  it('parses "12a" as midnight', () => {
    const result = parseRoutine('reset 12a')
    expect(result.time).toBe('00:00')
  })
})

describe('days without "every" prefix', () => {
  it('parses "monday gym"', () => {
    const result = parseRoutine('monday gym')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "gym monday"', () => {
    const result = parseRoutine('gym monday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "monday wednesday gym"', () => {
    const result = parseRoutine('monday wednesday gym')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.action).toBe('gym')
  })

  it('parses "gym monday wednesday"', () => {
    const result = parseRoutine('gym monday wednesday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.action).toBe('gym')
  })

  it('parses "gym monday and wednesday at 6pm"', () => {
    const result = parseRoutine('gym monday and wednesday at 6pm')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.time).toBe('18:00')
    expect(result.action).toBe('gym')
  })

  it('parses pluralized days "tuesdays"', () => {
    const result = parseRoutine('trash tuesdays')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([2])
    expect(result.action).toBe('trash')
  })

  it('parses "mondays and wednesdays"', () => {
    const result = parseRoutine('gym mondays and wednesdays')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
  })
})

describe('"on [days]" pattern', () => {
  it('parses "gym on monday"', () => {
    const result = parseRoutine('gym on monday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "on tuesdays take out trash"', () => {
    const result = parseRoutine('on tuesdays take out trash')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([2])
    expect(result.action).toBe('take out trash')
  })

  it('parses "meeting on monday and friday"', () => {
    const result = parseRoutine('meeting on monday and friday')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 5])
  })
})

describe('no recurrence defaults to daily', () => {
  it('parses "take vitamins" as daily', () => {
    const result = parseRoutine('take vitamins')
    expect(result.recurrence.type).toBe('daily')
    expect(result.action).toBe('take vitamins')
    expect(isValidParsedRoutine(result)).toBe(true)
  })

  it('parses "walk the dog" as daily', () => {
    const result = parseRoutine('walk the dog')
    expect(result.recurrence.type).toBe('daily')
    expect(result.action).toBe('walk the dog')
    expect(isValidParsedRoutine(result)).toBe(true)
  })

  it('parses "take vitamins at 7am" as daily at 7am', () => {
    const result = parseRoutine('take vitamins at 7am')
    expect(result.recurrence.type).toBe('daily')
    expect(result.time).toBe('07:00')
    expect(result.action).toBe('take vitamins')
  })
})

describe('flexible word order', () => {
  it('parses "7pm gym monday"', () => {
    const result = parseRoutine('7pm gym monday')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "monday 7pm gym"', () => {
    const result = parseRoutine('monday 7pm gym')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1])
    expect(result.action).toBe('gym')
  })

  it('parses "700p monday wednesday gym"', () => {
    const result = parseRoutine('700p monday wednesday gym')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([1, 3])
    expect(result.action).toBe('gym')
  })
})

describe('complex real-world inputs', () => {
  it('parses "iris walks jax 7a weekdays"', () => {
    const result = parseRoutine('iris walks jax 7a weekdays', mockContacts)
    expect(result.assignee).toBe('iris-id')
    expect(result.time).toBe('07:00')
    expect(result.recurrence.type).toBe('weekdays')
    expect(result.action).toBe('walks jax')
  })

  it('parses "trash tuesday thursday 7p"', () => {
    const result = parseRoutine('trash tuesday thursday 7p')
    expect(result.time).toBe('19:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([2, 4])
    expect(result.action).toBe('trash')
  })

  it('parses "family dinner sundays 6pm"', () => {
    const result = parseRoutine('family dinner sundays 6pm')
    expect(result.time).toBe('18:00')
    expect(result.recurrence.type).toBe('weekly')
    expect(result.recurrence.days).toEqual([0])
    expect(result.action).toBe('family dinner')
  })
})
```

---

## Acceptance Criteria

- [ ] `"take vitamins"` → daily, action = "take vitamins"
- [ ] `"monday wednesday gym"` → weekly Mon/Wed, action = "gym"
- [ ] `"gym monday wednesday"` → weekly Mon/Wed, action = "gym"
- [ ] `"700p"` → time 19:00
- [ ] `"7p"` → time 19:00
- [ ] `"1130a"` → time 11:30
- [ ] `"1930"` (military) → time 19:30
- [ ] `"tuesdays"` (plural) → weekly Tue
- [ ] `"gym on monday"` → weekly Mon
- [ ] `"7pm gym monday"` (time first) → time 19:00, weekly Mon
- [ ] All existing tests still pass
- [ ] Build compiles with no TypeScript errors

---

## Priority Order

1. **Time parsing** - Most user frustration here
2. **Days without "every"** - Second biggest pain point
3. **No recurrence = daily** - Should already work, verify/fix
4. **"on [days]" pattern** - Nice to have
5. **Pluralized days** - Nice to have

---

## Notes

- Keep the existing patterns working - these are additive changes
- The parser should be VERY forgiving - when in doubt, try to make sense of it
- Test with real inputs from the user: "700p", "take vitamins", "monday wednesday gym"
- The action should be everything NOT recognized as a pattern

---

## References

- `src/lib/parseRoutine.ts` - Current parser (444 lines)
- `src/lib/parseRoutine.test.ts` - Current tests (512 lines)
- `src/components/routine/RoutineInput.tsx` - Where parser is used
