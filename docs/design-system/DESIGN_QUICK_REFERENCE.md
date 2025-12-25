# Nordic Journal Quick Reference

## Copy-Paste Patterns for Claude Code

### Modal Backdrop
```tsx
style={{
  background: 'linear-gradient(180deg, hsl(32 20% 20% / 0.2) 0%, hsl(32 20% 20% / 0.4) 100%)',
  backdropFilter: 'blur(8px)',
}}
```

### Modal Panel Classes
```
bg-bg-elevated rounded-3xl shadow-2xl w-full max-w-lg mx-4
```

### Icon Badge (10x10)
```tsx
<div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
  <Icon className="w-5 h-5 text-primary-600" />
</div>
```

### Section Header
```tsx
<h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
```

### Display Title
```tsx
<h2 className="font-display text-xl font-semibold text-neutral-900">
```

### Card Base
```tsx
className="card group p-4 rounded-xl border border-transparent hover:border-neutral-200 hover:shadow-md transition-all duration-200"
```

### Card Selected
```tsx
className={selected 
  ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200' 
  : 'bg-bg-elevated border-transparent hover:border-neutral-200 hover:shadow-md'}
```

### Primary Button
```tsx
className="px-4 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 active:bg-primary-700 shadow-md shadow-primary-500/20 transition-all"
```

### Ghost Button
```tsx
className="px-4 py-2.5 rounded-xl border border-neutral-200 text-neutral-600 font-medium hover:bg-neutral-50 transition-all"
```

### Icon Button
```tsx
className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
```

### Input Field
```tsx
className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
```

### Large Input (Search/QuickCapture)
```tsx
className="w-full px-4 py-4 rounded-xl border border-neutral-200 bg-neutral-50 text-2xl font-display text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
```

### Project Chip
```tsx
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
```

### Contact Chip
```tsx
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100">
```

### Warning Badge
```tsx
<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-50 text-warning-600 rounded-full text-xs font-medium">
```

### Staggered Animation
```tsx
style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
className="animate-fade-in-up"
```

### Empty State (Celebratory)
```tsx
<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
  <div className="relative w-20 h-20 mb-6">
    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 animate-pulse-soft" />
    <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
      <CheckIcon className="w-8 h-8 text-white" />
    </div>
    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning-400 animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
  </div>
  <h3 className="font-display text-2xl font-semibold text-neutral-800 mb-2">All Clear</h3>
  <p className="text-neutral-500 max-w-xs">Description text here</p>
</div>
```

### Empty State (Neutral)
```tsx
<div className="flex flex-col items-center justify-center py-8 px-6 text-center">
  <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center mb-4">
    <Icon className="w-6 h-6 text-neutral-400" />
  </div>
  <p className="text-neutral-500">No results found</p>
</div>
```

### Keyboard Hint
```tsx
<kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">⌘K</kbd>
```

### Progress Bar
```tsx
<div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
  <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
</div>
```

### Divider (Gradient)
```tsx
<div className="h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent my-6" />
```

---

## Files to Upgrade (Priority Order)

1. **SearchModal.tsx** - Add backdrop blur, icon badge, staggered results
2. **QuickCapture.tsx** - Add backdrop blur, icon badge, upgrade FAB shadow
3. **InboxTaskCard.tsx** - Card hover states, chip styling
4. **TriageCard.tsx** - Premium border/shadow, gradient bg
5. **ScheduleItem.tsx** - Verify card pattern, chip styling
6. **TodaySchedule.tsx** - Display font headers, section dividers
7. **ProjectsList.tsx** - Card hover, progress bars, empty state
8. **RoutinesList.tsx** - Card hover, empty state
9. **DetailPanel.tsx** - Section headers, gradient header bg
10. **Onboarding steps** - Progress dots, centered layouts

## Remember

- `.font-display` = Fraunces serif
- `.bg-bg-base` = warm cream background  
- `.bg-bg-elevated` = white/elevated surface
- `rounded-xl` = 12px (cards)
- `rounded-2xl` = 16px (larger cards)
- `rounded-3xl` = 24px (modals)
- Always add `transition-all` or `transition-colors` for smooth states
