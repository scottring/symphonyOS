# Feature: Skip Button on Routine Cards

## Change
Add a skip button directly on routine cards, positioned to the left of the assignee avatar.

## Visual Spec
```
[6:55a] [○] Kids routine                    [⏭] [SK]
                                             ↑    ↑
                                           skip  avatar
```

## Behavior
- Click skip → marks this instance of the routine as skipped (not completed, not incomplete - skipped)
- Visual feedback: card grays out or shows strikethrough like completed items
- Only appears on routine cards, not regular tasks

## Icon
Use `SkipForward` from Lucide (or similar - the standard media skip icon)
```tsx
import { SkipForward } from 'lucide-react'
```

## Tooltip
"Skip this time"

## Files to modify
- `src/components/schedule/ScheduleItem.tsx` - add skip button for routine items
- May need to check how routine skip is handled in the data layer (does skip status already exist?)
