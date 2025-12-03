# Implementation: Natural Language Routines

## Overview
Transform routine creation from form-based to natural language input with semantic token display.

## Phase 1: Parser (`src/lib/parseRoutine.ts`)

### Input/Output
```typescript
interface ParsedRoutine {
  raw: string
  assignee: string | null           // Contact ID if matched, null if self
  assigneeName: string | null       // Display name
  action: string                    // The core action text
  recurrence: {
    type: 'daily' | 'weekdays' | 'weekends' | 'weekly'
    days?: number[]                 // 0=Sun, 1=Mon, etc. for weekly
  }
  timeOfDay: 'morning' | 'afternoon' | 'evening' | null
  time: string | null               // HH:MM format
  tokens: SemanticToken[]
}

interface SemanticToken {
  text: string
  type: 'person' | 'action' | 'day-pattern' | 'time-of-day' | 'time' | 'plain'
}
```

### Parsing Logic
1. **Normalize**: lowercase, trim
2. **Extract time**: Look for "at X" patterns
   - "at 7" → "07:00"
   - "at 7am" / "at 7 am" → "07:00"  
   - "at 7:30pm" → "19:30"
   - "at noon" → "12:00"
3. **Extract recurrence**: Look for patterns
   - "every day" / "daily" → type: 'daily'
   - "every weekday" / "monday through friday" / "mon-fri" / "weekdays" → type: 'weekdays'
   - "every weekend" / "weekends" / "saturday and sunday" → type: 'weekends'
   - "every monday" / "every tuesday" etc. → type: 'weekly', days: [1] etc.
   - "every monday and wednesday" → type: 'weekly', days: [1, 3]
4. **Extract time-of-day**: "morning" / "afternoon" / "evening"
5. **Extract assignee**: Check if first word(s) match a contact name
   - Match against contacts list (case-insensitive)
   - If match, extract ID and name
6. **Remaining text**: Everything else is the action

### Token Generation
Build tokens array as we parse, preserving display order:
```
"iris walks jax every weekday morning at 7am"
→ tokens: [
  { text: "IRIS", type: "person" },
  { text: " walks jax ", type: "action" },
  { text: "WEEKDAY", type: "day-pattern" },
  { text: " ", type: "plain" },
  { text: "MORNING", type: "time-of-day" },
  { text: " at ", type: "plain" },
  { text: "7a", type: "time" }
]
```

## Phase 2: Semantic Display Component

### File: `src/components/routine/SemanticRoutine.tsx`

```typescript
interface SemanticRoutineProps {
  tokens: SemanticToken[]
  size?: 'sm' | 'md'
}
```

Token styling (Tailwind classes):
- `person`: `font-semibold text-blue-700`
- `action`: `text-neutral-700`
- `day-pattern`: `px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium`
- `time-of-day`: `px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-xs font-medium`
- `time`: `font-mono text-neutral-600`
- `plain`: `text-neutral-500`

## Phase 3: Database Migration

### Add raw_input column
```sql
ALTER TABLE routines ADD COLUMN raw_input TEXT;
```

### Update Routine type
```typescript
// In src/types/actionable.ts
export interface Routine {
  // ... existing fields
  raw_input: string | null  // Add this
}
```

## Phase 4: Update RoutinesList

Replace current card content with SemanticRoutine display:
- If `raw_input` exists, parse it and show tokens
- If no `raw_input` (legacy), show current format

## Phase 5: New Creation Flow

### File: `src/components/routine/RoutineInput.tsx`

Single text input with:
1. Large serif font input (like QuickCapture)
2. Placeholder: "iris walks jax every weekday at 7am"
3. Live preview below showing parsed tokens
4. Save button (disabled until valid parse)

### Integration
- Replace "New Routine" button behavior
- On save: parse input, create routine with parsed fields + raw_input

## Phase 6: Update RoutineForm (Edit Mode)

If routine has `raw_input`:
- Show the raw text in same input style
- Live preview of tokens
- On save, re-parse and update

If no `raw_input` (legacy):
- Keep current form UI
- Or offer to "convert" by typing natural language

---

## File Changes Summary

| Action | File |
|--------|------|
| CREATE | `src/lib/parseRoutine.ts` |
| CREATE | `src/components/routine/SemanticRoutine.tsx` |
| CREATE | `src/components/routine/RoutineInput.tsx` |
| CREATE | `supabase/migrations/XXXX_add_routine_raw_input.sql` |
| UPDATE | `src/types/actionable.ts` (add raw_input) |
| UPDATE | `src/hooks/useRoutines.ts` (handle raw_input) |
| UPDATE | `src/components/routine/RoutinesList.tsx` (use SemanticRoutine) |
| UPDATE | `src/components/routine/RoutineForm.tsx` (support NL editing) |

## Execution Order
1. Parser + tests
2. SemanticRoutine component  
3. Database migration
4. Type updates
5. RoutineInput component
6. RoutinesList update
7. RoutineForm update

## Test Cases for Parser
```
"take vitamins every morning"
→ assignee: null, action: "take vitamins", recurrence: daily, timeOfDay: morning

"iris walks jax every weekday at 7am"  
→ assignee: "iris", action: "walks jax", recurrence: weekdays, time: "07:00"

"family dinner every sunday at 6pm"
→ assignee: null, action: "family dinner", recurrence: weekly/[0], time: "18:00"

"scott takes kids to school mon-fri at 7:19am"
→ assignee: "scott", action: "takes kids to school", recurrence: weekdays, time: "07:19"

"review goals every monday at 9"
→ assignee: null, action: "review goals", recurrence: weekly/[1], time: "09:00"
```
