# ESLint Fixes Task List

## Overview
Codebase review identified 18 ESLint errors and 8 warnings. This document provides instructions to fix all issues.

## Priority 1: Critical (Tonight's Changes)

### 1. DetailPanel.tsx - Unused Expression (Line 1119)

**File:** `src/components/detail/DetailPanel.tsx`
**Line:** ~1119
**Error:** `@typescript-eslint/no-unused-expressions`

**Problem:** Ternary expression used as statement instead of if/else
```tsx
// BAD
onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); contact ? toggleSection('contact') : setShowContactPicker(true) } }}
```

**Fix:** Replace ternary with if/else
```tsx
// GOOD
onKeyDown={(e) => { 
  if (e.key === 'Enter' || e.key === ' ') { 
    e.preventDefault(); 
    if (contact) {
      toggleSection('contact');
    } else {
      setShowContactPicker(true);
    }
  } 
}}
```

**Note:** Search for similar patterns in the file - there may be multiple occurrences of this pattern in onClick/onKeyDown handlers.

---

## Priority 2: Unused Variables

### 2. DetailPanelRedesign.tsx - Unused Variables (Lines 188, 193)

**File:** `src/components/detail/DetailPanelRedesign.tsx`
**Error:** `@typescript-eslint/no-unused-vars`

**Problem:** Variables `_onUpdateContact` and `_onUpdateProject` are defined but never used.

**Fix:** Either:
- Remove the unused variables if they're not needed
- Or prefix with underscore AND add eslint-disable comment if intentionally unused for future use:
```tsx
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _onUpdateContact = ...
```

---

## Priority 3: Static Components (Move Outside Render)

### 3. ProjectsListRedesign.tsx - SectionHeader Component

**File:** `src/components/project/ProjectsListRedesign.tsx`
**Lines:** 153-188, used at 292, 302, 312
**Error:** `react-hooks/static-components`

**Problem:** `SectionHeader` component is defined inside the parent component, causing it to be recreated on every render.

**Fix:** Move `SectionHeader` outside the component:

```tsx
// BEFORE: Inside ProjectsListRedesign component
export function ProjectsListRedesign(...) {
  const SectionHeader = ({ title, count, ... }) => (...)  // BAD
  return (...)
}

// AFTER: Outside the component
interface SectionHeaderProps {
  title: string
  count: number
  collapsed?: boolean
  onToggle?: () => void
}

function SectionHeader({ title, count, collapsed, onToggle }: SectionHeaderProps) {
  return (
    // ... existing JSX
  )
}

export function ProjectsListRedesign(...) {
  // Use SectionHeader without defining it here
  return (...)
}
```

### 4. RoutinesListRedesign.tsx - SectionHeader Component

**File:** `src/components/routine/RoutinesListRedesign.tsx`
**Lines:** 371-406, used at 512, 551
**Error:** `react-hooks/static-components`

**Same fix as above** - move `SectionHeader` outside the component function.

---

## Priority 4: setState in useEffect (Add eslint-disable comments)

These are intentional patterns for syncing local state with props. Add targeted eslint-disable comments.

### 5. ContactView.tsx (Line 46)

**File:** `src/components/contact/ContactView.tsx`

```tsx
// Sync state when contact changes
// eslint-disable-next-line react-hooks/set-state-in-effect
useEffect(() => {
  setEditedName(contact.name)
  setLocalPhone(contact.phone || '')
  setLocalEmail(contact.email || '')
  setLocalNotes(contact.notes || '')
}, [contact.id])
```

### 6. ContactViewRedesign.tsx (Line 47)

**File:** `src/components/contact/ContactViewRedesign.tsx`

Same fix as ContactView.tsx - add eslint-disable comment.

### 7. DetailPanelRedesign.tsx (Lines 245, 253, 275)

**File:** `src/components/detail/DetailPanelRedesign.tsx`

Add eslint-disable comments to each useEffect that syncs local state:
```tsx
// eslint-disable-next-line react-hooks/set-state-in-effect
useEffect(() => {
  setLocalNotes(item?.notes || '')
  // ...
}, [item?.id])
```

### 8. AddStopInput.tsx (Line 28)

**File:** `src/components/directions/AddStopInput.tsx`

```tsx
// eslint-disable-next-line react-hooks/set-state-in-effect
useEffect(() => {
  if (!query.trim()) {
    setResults([])
    return
  }
  // ...
}, [query])
```

### 9. SearchModal.tsx (Lines 54, 61)

**File:** `src/components/search/SearchModal.tsx`

Add eslint-disable comments to both useEffects.

### 10. TaskViewRedesign.tsx (Line 89)

**File:** `src/components/task/TaskViewRedesign.tsx`

Add eslint-disable comment.

### 11. useSearch.ts (Line 60)

**File:** `src/hooks/useSearch.ts`

Add eslint-disable comment.

---

## Priority 5: Missing Dependencies Warnings

### 12. DetailPanelRedesign.tsx (Lines 250, 295)

**File:** `src/components/detail/DetailPanelRedesign.tsx`

Add missing dependencies or disable if intentional:
```tsx
// Line 250: Add item?.notes to dependency array
useEffect(() => {
  setLocalNotes(item?.notes || '')
  // ...
}, [item?.id, item?.notes])  // Add item?.notes

// Line 295: Add actionable and item to dependency array or disable
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
  // ...
}, [item?.id])
```

### 13. WeeklyReview.tsx (Lines 54, 65)

**File:** `src/components/review/WeeklyReview.tsx`

Either add `handleClose` to dependency arrays or wrap `handleClose` in useCallback:
```tsx
const handleClose = useCallback(() => {
  // ... existing logic
}, [onClose])  // Add appropriate dependencies

// Then the useEffects will be satisfied
```

---

## Priority 6: Test Infrastructure (Required)

### 14. Fix jsdom/parse5 ESM Compatibility

**Problem:** Tests fail due to jsdom requiring parse5 via CommonJS but parse5 is ESM-only. This blocks all test runs.

**Recommended Fix:** Switch to happy-dom (lighter, faster, no ESM issues):

```bash
npm uninstall jsdom
npm install -D happy-dom
```

Then update `vite.config.ts` to use happy-dom:
```ts
export default defineConfig({
  test: {
    environment: 'happy-dom'
  }
})
```

**Alternative:** If happy-dom causes issues, try updating jsdom:
```bash
npm update jsdom
```

Or add vitest config for ESM handling:
```ts
export default defineConfig({
  test: {
    deps: {
      inline: ['jsdom']
    }
  }
})
```

---

## Verification

After making all fixes, run:
```bash
npm run lint
npm run build
npm test -- --run
```

All three commands should pass with zero errors.

---

## Summary Checklist

- [ ] Fix ternary expression in DetailPanel.tsx
- [ ] Remove/fix unused variables in DetailPanelRedesign.tsx
- [ ] Move SectionHeader outside ProjectsListRedesign.tsx
- [ ] Move SectionHeader outside RoutinesListRedesign.tsx
- [ ] Add eslint-disable comments to intentional setState-in-effect patterns (8 locations)
- [ ] Fix missing dependency warnings (3 locations)
- [ ] Fix test infrastructure (switch to happy-dom)
- [ ] Verify all tests pass
