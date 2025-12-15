# UI Fixes: Mode Toggle, Date Nav, Review Actions

## Fix 1: Replace Mode Toggle with Icon Buttons

The pill-style toggle looks crowded. Replace with icon buttons matching the Day/Week button style.

### Current:
```
[☀️ Today 6] [✓ Review 5]  (pill toggle in top-right)
```

### Target:
```
[☀️] [📋]  (icon buttons, same style as existing Day/Week buttons)
```

### Changes:
1. Remove ModeToggle pill component from header
2. Add two icon buttons next to the Day/Week buttons (or in same button group)
3. Icons:
   - Today mode: Sun icon (same as Day view uses)
   - Review mode: ClipboardCheck or ListChecks from Lucide (NOT sun - must be visually distinct)
4. Badges can still appear on the icons (small count indicator)
5. Active state should match Day/Week button active state

### Suggested Lucide icons:
```tsx
import { Sun, ClipboardCheck } from 'lucide-react'
// or
import { Sun, ListChecks } from 'lucide-react'
```

---

## Fix 2: Date Nav Arrows Inline with Heading

The arrows look strange on their own line. Move them inline.

### Current:
```
Today is Tuesday, December 9
         ◀  ▶
```

### Target:
```
Today is Tuesday, December 9  ◀ ▶
```

### Changes:
1. Put arrows on same line as heading, to the right of the date text
2. Remove the separate line for arrows
3. Keep the "Today" button behavior (shows only when not viewing today)

---

## Fix 3: Review Mode - Add Defer to "Keeps Getting Pushed"

Items in the "Keeps Getting Pushed" section need a defer option.

### Current actions:
```
[Tomorrow] [Pick date] [🗑]
```

### Target actions:
```
[Tomorrow] [Pick date] [⏭ Defer] [🗑]
```

### Changes:
1. Add defer button with ArrowRightToLine icon
2. Same defer behavior as inbox cards (opens DeferPicker)

---

## Fix 4: Trash Icon Always Visible

The trash icon currently appears on hover, but other action icons are persistent. This creates a visual gap.

### Change:
Make the trash icon always visible, not hover-only. Same opacity/style as other action buttons.

---

## Files likely affected:
- `src/components/home/HomeView.tsx` (mode buttons)
- `src/components/home/ModeToggle.tsx` (may be replaced/simplified)
- `src/components/schedule/TodaySchedule.tsx` (header layout, date nav)
- `src/components/schedule/DateNavigator.tsx` (inline with heading)
- `src/components/review/ReviewSection.tsx` (defer button, trash visibility)
