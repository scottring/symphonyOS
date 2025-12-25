# UI Fixes: Header Layout + Inbox Card Actions

## Fix 1: Header Layout

The mode toggle is obscuring the date navigator. Restructure the header.

### When viewing today:
```
Today is Tuesday, December 9      [☀️ Today 6] [✓ Review 5]
           ◀  ▶
```

### When viewing another day:
```
Thursday, December 11  [Today]    [☀️ Today 6] [✓ Review 5]
           ◀  ▶
```

### Changes:
1. **Heading text:** 
   - Viewing today: "Today is {full date}" (e.g., "Today is Tuesday, December 9")
   - Viewing other day: Just "{full date}" (e.g., "Thursday, December 11")

2. **Date nav arrows:** Move below the heading, centered under the date text

3. **"Today" button:** Only show when NOT viewing today. Clicking returns to today.

4. **Mode toggle:** Stays in top-right, no longer conflicts with nav arrows

---

## Fix 2: Inbox Card Actions

### Current:
```
[📅 Schedule] [🕐] [SK]
```

### Target:
```
[📅] [⏭] [SK]
```

### Changes:

1. **Schedule button:**
   - Remove text label "Schedule"
   - Keep calendar icon only
   - Add tooltip: "Schedule"

2. **Defer button:**
   - Change icon from clock to `arrow-right-to-line` from Lucide
   - Add tooltip: "Defer: I will decide what to do with this later"

### Lucide import:
```tsx
import { Calendar, ArrowRightToLine } from 'lucide-react'
```

### Example button with tooltip (using existing tooltip pattern or title attr):
```tsx
<button title="Schedule">
  <Calendar className="h-4 w-4" />
</button>

<button title="Defer: I will decide what to do with this later">
  <ArrowRightToLine className="h-4 w-4" />
</button>
```
