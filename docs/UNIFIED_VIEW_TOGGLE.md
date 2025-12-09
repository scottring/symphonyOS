# Fix: Unified View Toggle (Today / Week / Review)

## Problem
Too many icons in top-right corner. Two sun icons is confusing. Mode toggle and view toggle are separate but don't need to be.

## Solution
Consolidate into one unified toggle with three options:

```
[☀️ Today] [📅 Week] [📋 Review]
```

## Changes

### 1. Remove the separate ModeToggle component
The current ModeToggle (Today/Review pill or icon buttons) gets merged into the main view switcher.

### 2. Update HomeViewSwitcher (or create unified ViewToggle)
Three options in one button group:
- **Today** - Sun icon - shows today's schedule (current Today mode)
- **Week** - Calendar icon - shows week view (existing week view)
- **Review** - ClipboardCheck icon - shows review mode (current Review mode)

### 3. Icons (Lucide)
```tsx
import { Sun, Calendar, ClipboardCheck } from 'lucide-react'
```

### 4. State change
Instead of separate `currentView` (today/week) and `mode` (today/review), use single state:
```tsx
type View = 'today' | 'week' | 'review'
const [currentView, setCurrentView] = useState<View>('today')
```

### 5. Remove
- The duplicate sun icon (was Day view button)
- Separate ModeToggle component from header
- Any mode state that's now redundant

### 6. Badge behavior
- Today: show inbox count badge (if > 0)
- Week: no badge
- Review: show attention-needed count badge (if > 0)

## Visual spec
Same styling as current Day/Week toggle - simple icon buttons in a row, active state highlighted.

## Files to modify
- `src/components/home/HomeView.tsx` - consolidate state, remove mode state
- `src/components/home/HomeViewSwitcher.tsx` - add Review option, update to 3 buttons
- `src/components/home/ModeToggle.tsx` - can be deleted or merged
- `src/components/schedule/TodaySchedule.tsx` - may need prop updates
