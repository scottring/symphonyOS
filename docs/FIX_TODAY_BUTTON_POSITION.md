# Fix: Today Button Between Arrows

## Change
Move the "Today" button to appear between the left and right navigation arrows.

### Current (when viewing another day):
```
Thursday, December 11 [Today]  ◀ ▶
```

### Target:
```
Thursday, December 11  ◀ [Today] ▶
```

## File to modify
`src/components/schedule/DateNavigator.tsx` (or wherever the arrows + Today button are rendered)

## Layout
```tsx
<div className="flex items-center gap-1">
  <button onClick={goBack}>◀</button>
  {!isToday && <button onClick={goToToday}>Today</button>}
  <button onClick={goForward}>▶</button>
</div>
```

The "Today" button only appears when not viewing today, positioned between the arrows.
