# Project Color Edge Indicator

## Problem
Current project pills on timeline cards are visually heavy - blue badges with folder icons that compete with task titles. The truncated text ("Plan Iris's Birthda...") looks awkward.

## Solution
Replace project pills with a thin colored left edge on cards. Hover reveals project name in tooltip.

## Design

### Visual
- 3px vertical stripe on left edge of task cards that have a project
- Color is derived from project (consistent color per project)
- No text, no icon on the card itself
- Cards without projects have no stripe (or a neutral/transparent edge)

### Interaction
- **Desktop:** Hover on card → tooltip appears showing project name
- **Mobile:** Long-press or just tap into detail panel (project shown there)

### Color Generation
Each project needs a consistent color. Options:
1. Hash project ID to pick from a preset palette (8-10 colors)
2. Let users pick project color (future enhancement)

For now, use option 1 - hash-based color from palette:

```typescript
const PROJECT_COLORS = [
  '#10B981', // emerald
  '#3B82F6', // blue  
  '#8B5CF6', // violet
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
]

function getProjectColor(projectId: string): string {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(i)
    hash = hash & hash
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]
}
```

## Implementation

### 1. Remove existing project pill
In the timeline item component, remove the blue pill that shows project name with folder icon.

### 2. Add colored left edge
Add a pseudo-element or wrapper div for the colored stripe:

```tsx
// Conceptual - adapt to actual component structure
<div 
  className="relative rounded-xl bg-white ..."
  style={{ 
    borderLeft: project ? `3px solid ${getProjectColor(project.id)}` : undefined 
  }}
>
  {/* card content */}
</div>
```

Or use a pseudo-element approach for cleaner separation.

### 3. Add tooltip on hover
Use a simple CSS tooltip or a lightweight component:

```tsx
{project && (
  <div className="group">
    <div 
      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
      style={{ backgroundColor: getProjectColor(project.id) }}
    />
    {/* Tooltip */}
    <div className="
      absolute left-2 top-1/2 -translate-y-1/2
      opacity-0 group-hover:opacity-100
      pointer-events-none
      px-2 py-1 text-xs font-medium
      bg-neutral-800 text-white rounded
      whitespace-nowrap
      transition-opacity duration-150
      z-10
    ">
      {project.name}
    </div>
  </div>
)}
```

### 4. Utility function location
Put `getProjectColor` in `src/lib/projectUtils.ts` or similar - it may be useful elsewhere.

## Files to modify
- Timeline item card component (likely in `src/components/home/` or `src/components/timeline/`)
- Create `src/lib/projectUtils.ts` for color function

## Testing
1. View timeline with tasks that have projects assigned
2. Should see colored left edge (no pill, no text)
3. Hover over card → tooltip shows project name
4. Tasks without projects should have no colored edge
5. Same project should always show same color

## Notes
- Consult `/mnt/skills/public/frontend-design/SKILL.md` before implementing
- Keep tooltip simple and fast (CSS-only preferred, no heavy tooltip library)
- Ensure colors have enough contrast against white card background
- Mobile: tooltip not needed, users tap into detail panel
