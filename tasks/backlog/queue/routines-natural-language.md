# Routines: Natural Language Input & Semantic Display

## Priority
HIGH — Routines have dedicated sidebar link but minimal implementation

## Vision
Type natural language like you'd say it out loud. System parses and renders back with semantic highlighting showing what it understood.

## Input Examples
```
iris walks jax every morning monday through friday at 7am
scott takes the kids to school every weekday morning at 7:19
family dinner every sunday at 6pm
take vitamins every morning
review weekly goals every monday at 9am
```

## Output Display (Semantic Tokens)
The display renders as prose with highlighted "atoms":

```
IRIS walks JAX every WEEKDAY MORNING at 7a
SCOTT takes the KIDS to school every WEEKDAY MORNING at 7:19a
FAMILY DINNER every SUNDAY at 6p
Take VITAMINS every MORNING
Review WEEKLY GOALS every MONDAY at 9a
```

### Token Types (visually distinct)
| Token Type | Examples | Visual Treatment |
|------------|----------|------------------|
| Person | IRIS, SCOTT | Bold + color (assignee) |
| Group | KIDS, FAMILY | Bold + different color |
| Pet/Object | JAX, VITAMINS | Caps, subtle highlight |
| Day Pattern | WEEKDAY, MONDAY, SUNDAY | Pill/chip style |
| Time-of-Day | MORNING, EVENING | Pill/chip style |
| Time | 7a, 7:19a, 6p | Monospace or distinct |

## Parsing Strategy

### Extract in order:
1. **Assignee** — Look for known contacts at start ("iris...", "scott...")
2. **Time** — Find "at X" pattern, parse time
3. **Recurrence** — Find day patterns:
   - "every day" / "daily"
   - "every weekday" / "monday through friday" / "mon-fri"
   - "every weekend" / "saturday and sunday"
   - "every monday" / "every tuesday" / specific days
   - "every morning" / "every evening" (time-of-day without specific time)
4. **Action** — Everything else is the action text

### Data Model (parsed)
```typescript
interface ParsedRoutine {
  raw: string                          // Original input
  assignee: string | null              // Contact name or null (self)
  action: string                       // "walks jax", "takes the kids to school"
  recurrence: {
    type: 'daily' | 'weekdays' | 'weekends' | 'specific'
    days?: number[]                    // 0-6 for specific days
    timeOfDay?: 'morning' | 'evening' | null
  }
  time: string | null                  // "07:00" or null
  tokens: SemanticToken[]              // For rendering
}

interface SemanticToken {
  text: string
  type: 'person' | 'group' | 'object' | 'day-pattern' | 'time-of-day' | 'time' | 'plain'
  value?: string                       // Normalized value if applicable
}
```

## UI Flow

### Creation
1. Single text input (like QuickCapture)
2. As you type, show live preview of parsed result below
3. Highlight any ambiguity or unrecognized parts
4. Save creates the routine

### Display (Routines List)
Each routine shows as a single line of semantic prose:
```
┌─────────────────────────────────────────────────┐
│ ☀️ Morning                                       │
│   IRIS walks JAX · WEEKDAY · 7a                 │
│   SCOTT takes KIDS to school · WEEKDAY · 7:19a  │
│   Take VITAMINS · DAILY                         │
│                                                 │
│ 🌙 Evening                                       │
│   FAMILY DINNER · SUNDAY · 6p                   │
└─────────────────────────────────────────────────┘
```

Or flat list with visual tokens inline.

### Editing
Click routine → opens with original natural language text
Edit and re-parse on save

## Edge Cases
- No assignee = self (current user)
- No time = appears in time-of-day section without specific time
- Ambiguous day patterns → ask for clarification or best guess
- Unknown names → treat as object/action text, not person

## Integration with Today View
Routine instances already generate on Today — this is about making routine CREATION and MANAGEMENT natural language driven.

## Dependencies
- Contacts list (for assignee matching)
- Existing routine data model (may need migration)
- parseNaturalDate.ts patterns (can extend/reuse)

## Open Questions
1. Should editing show the original text or a form-based editor?
2. How to handle routines that don't fit the pattern? (fallback to form?)
3. Visual design for token highlighting — pills? bold? colors?
