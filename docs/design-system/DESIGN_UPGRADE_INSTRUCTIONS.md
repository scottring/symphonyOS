# Symphony OS Premium Design Upgrade Instructions

## Overview

This document provides comprehensive instructions for upgrading all Symphony OS components to the **Nordic Journal** design system - a premium, warm aesthetic inspired by Scandinavian design principles.

**Design Philosophy**: Warm, intentional, and tactile. Every interaction should feel considered. Avoid generic "AI app" aesthetics.

---

## Design System Foundation

### Color Palette

```css
/* Primary - Deep Forest Green */
--primary-50: hsl(152 45% 96%);
--primary-100: hsl(152 45% 90%);
--primary-200: hsl(152 45% 80%);
--primary-300: hsl(152 45% 65%);
--primary-400: hsl(152 45% 50%);
--primary-500: hsl(152 50% 38%);  /* Main brand */
--primary-600: hsl(152 50% 32%);
--primary-700: hsl(152 55% 25%);

/* Neutrals - Warm Cream */
--neutral-50: hsl(42 45% 97%);   /* bg-base */
--neutral-100: hsl(40 35% 94%);
--neutral-200: hsl(38 25% 88%);
--neutral-300: hsl(36 20% 78%);
--neutral-400: hsl(34 15% 58%);
--neutral-500: hsl(32 12% 45%);
--neutral-600: hsl(30 12% 35%);
--neutral-700: hsl(28 15% 25%);
--neutral-800: hsl(26 18% 18%);
--neutral-900: hsl(24 20% 12%);

/* Semantic Colors */
--success: hsl(152 60% 40%);
--warning: hsl(38 95% 50%);
--danger: hsl(0 70% 55%);
--info: hsl(210 80% 55%);
```

### Typography

```css
/* Display Font - Fraunces (serif, for headers) */
font-family: 'Fraunces', Georgia, serif;
/* Use: .font-display */

/* Body Font - DM Sans (clean sans-serif) */
font-family: 'DM Sans', system-ui, sans-serif;
/* Use: default body text */
```

**Typography Scale**:
- Page titles: `font-display text-2xl font-semibold`
- Section headers: `font-display text-xl font-medium`
- Card titles: `text-lg font-semibold` (DM Sans)
- Body text: `text-base` or `text-sm`
- Captions/labels: `text-xs font-medium uppercase tracking-wide text-neutral-500`

### Spacing & Radius

- **Border radius**: `rounded-xl` (12px) for cards, `rounded-2xl` (16px) for modals, `rounded-3xl` (24px) for premium modals
- **Padding**: `p-4` standard, `p-5` generous, `p-6` or `p-8` for modals
- **Gaps**: `gap-3` standard, `gap-4` generous

### Shadows

```css
/* Subtle elevation */
shadow-sm -> shadow-md on hover

/* Cards */
.card {
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03);
}

/* Premium colored shadow */
shadow-primary -> shadow-lg shadow-primary-500/10

/* Modal backdrop */
background: linear-gradient(180deg, hsl(32 20% 20% / 0.2) 0%, hsl(32 20% 20% / 0.4) 100%);
backdrop-filter: blur(8px);
```

---

## Animation Patterns

### Standard Animations (add to tailwind.config.js if missing)

```js
animation: {
  'fade-in': 'fadeIn 0.2s ease-out',
  'fade-in-up': 'fadeInUp 0.3s ease-out',
  'fade-in-scale': 'fadeInScale 0.2s ease-out',
  'slide-in-right': 'slideInRight 0.3s ease-out',
  'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
},
keyframes: {
  fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
  fadeInUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
  fadeInScale: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
  slideInRight: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
  pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.7' } },
}
```

### Staggered Entry Animation

```tsx
// For lists of items
{items.map((item, index) => (
  <div 
    key={item.id}
    className="animate-fade-in-up"
    style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
  >
    {/* content */}
  </div>
))}
```

### Modal Open/Close Animation

```tsx
// Opening: scale from 0.95 with translateY
// Closing: scale to 0.95 with translateY, then unmount after 200ms
const [isClosing, setIsClosing] = useState(false);

const handleClose = () => {
  setIsClosing(true);
  setTimeout(() => {
    setIsClosing(false);
    onClose();
  }, 200);
};
```

---

## Component Upgrade Checklist

### 1. MODALS (High Priority)

**Files**: `SearchModal.tsx`, `QuickCapture.tsx`, `WeeklyReview.tsx` (done)

**Pattern to apply**:
```tsx
{/* Backdrop */}
<div className={`
  fixed inset-0 z-50 flex items-center justify-center
  transition-all duration-200
  ${isClosing ? 'opacity-0' : 'opacity-100'}
`}
style={{
  background: 'linear-gradient(180deg, hsl(32 20% 20% / 0.2) 0%, hsl(32 20% 20% / 0.4) 100%)',
  backdropFilter: 'blur(8px)',
}}>
  
  {/* Modal Panel */}
  <div className={`
    bg-bg-elevated rounded-3xl shadow-2xl w-full max-w-lg mx-4
    transform transition-all duration-200
    ${isClosing 
      ? 'scale-95 opacity-0 translate-y-2' 
      : 'scale-100 opacity-100 translate-y-0'}
  `}>
    {/* Header with icon badge */}
    <div className="p-5 border-b border-neutral-100">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
          <IconComponent className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-neutral-900">Title</h2>
          <p className="text-sm text-neutral-500">Subtitle</p>
        </div>
      </div>
    </div>
    
    {/* Content */}
    <div className="p-5">
      {/* ... */}
    </div>
  </div>
</div>
```

**SearchModal.tsx specific upgrades**:
- Add backdrop blur gradient
- Add icon badge in header (magnifying glass)
- Upgrade input: `rounded-xl bg-neutral-50 border-neutral-200 focus:ring-primary-500`
- Add staggered animation to results
- Upgrade section headers: `text-xs font-medium uppercase tracking-wide text-neutral-500`
- Add keyboard hint pills styling: `px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono`

**QuickCapture.tsx specific upgrades**:
- Same modal pattern as above
- Header with sparkle/plus icon badge
- Upgrade FAB: add `shadow-lg shadow-primary-500/25` colored shadow

---

### 2. CARDS (High Priority)

**Files**: `ScheduleItem.tsx`, `InboxTaskCard.tsx`, `TriageCard.tsx`

**Standard card pattern**:
```tsx
<div className="
  card group
  p-4 rounded-xl
  border border-transparent
  hover:border-neutral-200 hover:shadow-md
  transition-all duration-200
">
  {/* Content */}
</div>
```

**Selected state**:
```tsx
className={`
  ${selected 
    ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200' 
    : 'bg-bg-elevated border-transparent hover:border-neutral-200 hover:shadow-md'}
`}
```

**TriageCard.tsx upgrades**:
- Change border from `border-2 border-primary-200` to `border border-primary-300 shadow-lg shadow-primary-500/10`
- Add `rounded-2xl` instead of `rounded-xl`
- Add subtle gradient background: `bg-gradient-to-br from-white to-primary-50/30`

---

### 3. EMPTY STATES (High Priority)

**Pattern for celebratory empty states** (use in WeeklyReview, InboxSection, ProjectsList when empty):

```tsx
<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
  {/* Layered illustration */}
  <div className="relative w-20 h-20 mb-6">
    {/* Outer glow ring */}
    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 animate-pulse-soft" />
    {/* Inner circle with icon */}
    <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
      <CheckIcon className="w-8 h-8 text-white" />
    </div>
    {/* Decorative sparkles */}
    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning-400 animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
    <div className="absolute -bottom-2 -left-1 w-2 h-2 rounded-full bg-primary-300 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
  </div>
  
  <h3 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
    All Clear
  </h3>
  <p className="text-neutral-500 max-w-xs">
    You're all caught up. Time to focus on what matters.
  </p>
</div>
```

**Pattern for neutral empty states** (use in search results, project task lists):

```tsx
<div className="flex flex-col items-center justify-center py-8 px-6 text-center">
  <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center mb-4">
    <SearchIcon className="w-6 h-6 text-neutral-400" />
  </div>
  <p className="text-neutral-500">No results found</p>
</div>
```

---

### 4. FORM INPUTS

**Standard input**:
```tsx
<input className="
  w-full px-4 py-3 
  rounded-xl border border-neutral-200 
  bg-neutral-50 
  text-neutral-800 placeholder:text-neutral-400
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
  transition-all
" />
```

**Large display input** (for QuickCapture, Search):
```tsx
<input className="
  w-full px-4 py-4 
  rounded-xl border border-neutral-200 
  bg-neutral-50 
  text-2xl font-display text-neutral-800 placeholder:text-neutral-400
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
" />
```

**Textarea**:
```tsx
<textarea className="
  w-full px-4 py-3 
  rounded-xl border border-neutral-200 
  bg-white
  text-neutral-700 placeholder:text-neutral-400
  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
  resize-none
" />
```

---

### 5. BUTTONS

**Primary button** (`.btn-primary`):
```css
.btn-primary {
  @apply px-4 py-2.5 rounded-xl
         bg-primary-500 text-white font-medium
         hover:bg-primary-600 
         active:bg-primary-700 active:scale-[0.98]
         shadow-md shadow-primary-500/20
         transition-all duration-200;
}
```

**Secondary/Ghost button**:
```tsx
<button className="
  px-4 py-2.5 rounded-xl
  border border-neutral-200 
  text-neutral-600 font-medium
  hover:bg-neutral-50 hover:border-neutral-300
  active:bg-neutral-100
  transition-all
">
```

**Icon button**:
```tsx
<button className="
  p-2.5 rounded-xl
  text-neutral-400 
  hover:text-neutral-600 hover:bg-neutral-100
  transition-all
">
```

**Danger button** (for delete):
```tsx
<button className="
  px-4 py-2.5 rounded-xl
  bg-danger-50 text-danger-600 font-medium border border-danger-200
  hover:bg-danger-100
  transition-all
">
```

---

### 6. BADGES & CHIPS

**Project chip**:
```tsx
<span className="
  inline-flex items-center gap-1.5 
  px-2.5 py-1 
  bg-blue-50 text-blue-700 
  rounded-full text-xs font-medium 
  border border-blue-100
">
  <FolderIcon className="w-3 h-3" />
  <span className="truncate max-w-[100px]">Project Name</span>
</span>
```

**Contact chip**:
```tsx
<span className="
  inline-flex items-center gap-1.5 
  px-2.5 py-1 
  bg-primary-50 text-primary-700 
  rounded-full text-xs font-medium 
  border border-primary-100
">
  <UserIcon className="w-3 h-3" />
  <span className="truncate max-w-[80px]">Contact</span>
</span>
```

**Status badge**:
```tsx
<span className="
  inline-flex items-center gap-1 
  px-2 py-0.5 
  bg-warning-50 text-warning-600 
  rounded-full text-xs font-medium
">
  <RefreshIcon className="w-3 h-3" />
  <span>3</span>
</span>
```

**Count badge** (for nav items):
```tsx
<span className="
  min-w-[20px] h-5 
  px-1.5 
  bg-primary-500 text-white 
  rounded-full text-xs font-semibold
  flex items-center justify-center
">
  {count}
</span>
```

---

### 7. NAVIGATION

**Sidebar nav item - Active state**:
```tsx
className={`
  w-full flex items-center gap-3 px-3 py-3 rounded-xl 
  transition-all duration-200
  ${isActive
    ? 'bg-primary-50 text-primary-700 font-medium shadow-sm'
    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'}
`}
```

**Mobile bottom nav - Active state**:
```tsx
className={`
  flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all
  ${isActive
    ? 'text-primary-600'
    : 'text-neutral-400 hover:text-neutral-600'}
`}
```

---

### 8. SPECIFIC COMPONENT UPGRADES

#### DetailPanel.tsx

1. **Header section**: Add subtle gradient or texture
```tsx
<div className="p-5 border-b border-neutral-100 bg-gradient-to-b from-neutral-50/50 to-transparent">
```

2. **Section headers**: Standardize
```tsx
<h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
  Section Title
</h3>
```

3. **Collapsible sections**: Add chevron rotation animation
```tsx
<svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
```

4. **Link pills**: Upgrade styling
```tsx
<a className="
  inline-flex items-center gap-2 
  px-3 py-2 
  bg-neutral-50 hover:bg-neutral-100 
  rounded-xl text-sm text-neutral-700
  border border-neutral-200
  transition-all
">
```

#### TodaySchedule.tsx / HomeView.tsx

1. **Date header**: Use display font
```tsx
<h1 className="font-display text-2xl font-semibold text-neutral-900">
  {formattedDate}
</h1>
```

2. **Section dividers**: Subtle styling
```tsx
<div className="h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent my-6" />
```

3. **Time group headers**:
```tsx
<div className="flex items-center gap-3 mb-3">
  <span className="text-sm font-semibold text-neutral-700">{time}</span>
  <div className="flex-1 h-px bg-neutral-200" />
</div>
```

#### ProjectsList.tsx / RoutinesList.tsx

1. **List items**: Card-style with hover
```tsx
<div className="
  group p-4 rounded-xl 
  bg-bg-elevated border border-transparent
  hover:border-neutral-200 hover:shadow-md
  transition-all duration-200 cursor-pointer
">
```

2. **Progress indicators**: Use primary color
```tsx
<div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
  <div 
    className="h-full bg-primary-500 rounded-full transition-all"
    style={{ width: `${progress}%` }}
  />
</div>
```

#### OnboardingWizard.tsx (steps)

1. **Step containers**: Full-height centered
```tsx
<div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
  <div className="w-full max-w-md animate-fade-in-up">
    {/* Content */}
  </div>
</div>
```

2. **Progress indicator**: Premium styling
```tsx
<div className="flex gap-2">
  {steps.map((_, i) => (
    <div 
      key={i}
      className={`
        h-1.5 rounded-full transition-all duration-300
        ${i <= currentStep ? 'bg-primary-500 w-8' : 'bg-neutral-200 w-4'}
      `}
    />
  ))}
</div>
```

---

## Implementation Priority

### Phase 1: High-Impact Modals
1. `SearchModal.tsx` - Used frequently, high visibility
2. `QuickCapture.tsx` - Core interaction point

### Phase 2: Core Cards
3. `InboxTaskCard.tsx` - Inbox is key workflow
4. `TriageCard.tsx` - Triage flow prominence
5. `ScheduleItem.tsx` - Main timeline view

### Phase 3: Views & Lists
6. `TodaySchedule.tsx` / `HomeView.tsx` - Main screen
7. `ProjectsList.tsx` - Project management
8. `RoutinesList.tsx` - Routine management

### Phase 4: Detail & Forms
9. `DetailPanel.tsx` - Large component, careful refactor
10. Onboarding steps - Polish for first-run experience

### Phase 5: Polish
11. Empty states across all components
12. Loading states
13. Error states
14. Micro-interactions

---

## Testing Checklist

After each component upgrade:
- [ ] Visual inspection on desktop (light mode)
- [ ] Visual inspection on mobile viewport
- [ ] Hover states work correctly
- [ ] Focus states are visible (accessibility)
- [ ] Animations are smooth (no jank)
- [ ] Selected/active states are clear
- [ ] Empty states render correctly
- [ ] Loading states look good
- [ ] TypeScript compilation passes
- [ ] Existing tests still pass
- [ ] Build succeeds

---

## Notes for Implementation

1. **Preserve functionality**: These are purely visual upgrades. Do not change component logic, props, or behavior.

2. **Use existing utilities**: The project has existing Tailwind config with many of these colors. Check `tailwind.config.js` for available values.

3. **Existing utility classes**: `.card`, `.btn-primary`, `.input-base`, `.touch-target` may already exist. Verify before duplicating.

4. **Font loading**: Ensure Fraunces and DM Sans are loaded in `index.html` or via CSS import.

5. **Test incrementally**: Upgrade one component at a time and verify before moving to the next.

6. **Animations on mobile**: Consider reducing motion for `prefers-reduced-motion` media query.
