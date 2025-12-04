# Fix Quality Issues from Codebase Scan

**Date:** 2025-01-04
**Priority:** High
**Status:** Complete

---

## Overview

A comprehensive codebase quality scan identified several issues that need fixing. This task covers all critical and minor issues found.

---

## Pre-Flight Checks

Before starting, verify the issues exist:

```bash
npm run lint          # Should show 3 errors
npm test -- --run     # Should fail with jsdom/parse5 error
npm run build         # Should pass (baseline)
```

---

## Tasks

### 1. Fix Test Infrastructure (jsdom/parse5 ESM conflict)

**Problem:** Tests fail with `require() of ES Module parse5 from jsdom not supported`

**Root Cause:** jsdom v27 has compatibility issues with parse5's ESM format

**Solution:** Update vitest.config.ts to inline the problematic dependency

**File:** `vitest.config.ts`

**Change:**
```typescript
// Add deps configuration to the test block
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  deps: {
    optimizer: {
      web: {
        include: ['parse5'],
      },
    },
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: ['node_modules/', 'src/test/'],
  },
},
```

**Verify:** `npm test -- --run` should now execute tests

---

### 2. Fix ESLint Error: setState in useEffect (RoutineForm.tsx)

**Problem:** Line 50 - Calling setState synchronously within an effect causes cascading renders

**File:** `src/components/routine/RoutineForm.tsx`

**Solution:** The parent component should pass a `key` prop to force remount when routine changes, eliminating the need for the useEffect entirely.

**Step 2a:** Remove the problematic useEffect (lines 48-56):

```typescript
// DELETE THIS ENTIRE BLOCK:
// Reset form when routine changes
useEffect(() => {
  setNlInput(routine.raw_input || '')
  setName(routine.name)
  setDescription(routine.description || '')
  setRecurrenceType(routine.recurrence_pattern.type)
  setSelectedDays(routine.recurrence_pattern.days || [])
  setTimeOfDay(routine.time_of_day || '')
}, [routine])
```

**Step 2b:** Update the parent in `src/App.tsx` to pass a key prop.

Find the RoutineForm usage (around line 481):
```typescript
// BEFORE:
<RoutineForm
  routine={selectedRoutine}
  contacts={contacts}
  ...
/>

// AFTER:
<RoutineForm
  key={selectedRoutine.id}
  routine={selectedRoutine}
  contacts={contacts}
  ...
/>
```

**Why this works:** React will unmount and remount the component when the key changes, naturally resetting all useState hooks to their initial values (which already reference `routine.*`).

---

### 3. Fix ESLint Error: Mixed Exports (SemanticRoutine.tsx)

**Problem:** Line 86 - File exports both component and utility function, breaking Fast Refresh

**Solution:** Move `formatLegacyRoutine` to a separate utility file

**Step 3a:** Create new file `src/lib/routineFormatters.ts`:

```typescript
/**
 * Format a routine for display when no raw_input exists (legacy routines)
 * Returns simple text description
 */
export function formatLegacyRoutine(
  name: string,
  recurrenceType: string,
  days?: string[],
  timeOfDay?: string | null
): string {
  let recurrenceText = ''

  switch (recurrenceType) {
    case 'daily':
      recurrenceText = 'every day'
      break
    case 'weekly': {
      if (!days || days.length === 0) {
        recurrenceText = 'weekly'
      } else if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) {
        recurrenceText = 'weekdays'
      } else if (days.length === 2 && days.includes('sat') && days.includes('sun')) {
        recurrenceText = 'weekends'
      } else {
        const dayMap: Record<string, string> = {
          sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat'
        }
        recurrenceText = 'every ' + days.map(d => dayMap[d] || d).join(', ')
      }
      break
    }
    case 'monthly':
      recurrenceText = 'monthly'
      break
    default:
      recurrenceText = ''
  }

  let timeText = ''
  if (timeOfDay) {
    const [hours, minutes] = timeOfDay.split(':').map(Number)
    const h12 = hours % 12 || 12
    const meridiem = hours >= 12 ? 'pm' : 'am'
    timeText = minutes === 0 ? `at ${h12}${meridiem}` : `at ${h12}:${minutes.toString().padStart(2, '0')}${meridiem}`
  }

  return [name, recurrenceText, timeText].filter(Boolean).join(' ')
}
```

**Step 3b:** Remove the function from `src/components/routine/SemanticRoutine.tsx`

Delete lines 76-130 (the entire `formatLegacyRoutine` function and its JSDoc comment).

The file should end after the `TokenDisplay` component (around line 75).

**Step 3c:** No import updates needed

Note: `formatLegacyRoutine` is currently exported but not imported anywhere in the codebase. 
Moving it to `@/lib/routineFormatters.ts` makes it available for future use while fixing the Fast Refresh issue.

---

### 4. Fix ESLint Error: let → const (parseRoutine.ts)

**Problem:** Line 219 - `actionParts` is never reassigned, should use `const`

**File:** `src/lib/parseRoutine.ts`

**Change line 219:**
```typescript
// BEFORE:
let actionParts: string[] = []

// AFTER:
const actionParts: string[] = []
```

---

## Verification Checklist

After completing all fixes, run these commands:

```bash
# All should pass with no errors
npm run lint
npm test -- --run
npm run build
```

**Expected Results:**
- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] `npm test -- --run` → All tests pass (no jsdom errors)
- [ ] `npm run build` → Successful build

---

## Post-Fix Summary

After fixing, add a summary here:

### Changes Made
- [x] Updated vitest.config.ts to handle parse5 ESM
- [x] Removed useEffect from RoutineForm.tsx, added key prop in App.tsx (already done)
- [x] Extracted formatLegacyRoutine to src/lib/routineFormatters.ts
- [x] Changed let to const in parseRoutine.ts line 219

### Tests Passing
- [x] Verified with `npm run lint` → 0 errors
- [x] Verified with `npm test -- --run` → 165 tests pass
- [x] Verified with `npm run build` → Success

---

## Notes

- The bundle size warning (629KB > 500KB) is informational and not blocking
- Node.js version warning can be addressed separately by upgrading Node
- Error toast system is a feature enhancement, not a bug fix
