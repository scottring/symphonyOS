# Site Maintenance & Optimization Checklist

## 1. Dead Code Removal

### Files to evaluate for deletion:
- `src/components/review/WeeklyReview.tsx` - deprecated, replaced by inline Review mode
- `src/components/triage/InboxTriageModal.tsx` - deprecated, replaced by popovers
- `src/components/home/ModeToggle.tsx` - may be dead code after unified view toggle

### Steps:
1. Search codebase for imports of each file
2. If no imports found, delete the file
3. Remove from any index.ts barrel exports

---

## 2. Unused Dependencies

Run:
```bash
npm outdated
```

Check for:
- Packages that can be updated
- Packages no longer used (check package.json against actual imports)

---

## 3. Unused Imports & Dead Code

Run:
```bash
npx tsc --noEmit
```

And check for:
- Unused imports (TypeScript warnings)
- Unreachable code
- Unused variables

Consider running:
```bash
npx knip
```
(if installed) to detect unused exports and files

---

## 4. Console Cleanup

Search for and evaluate:
```bash
grep -r "console.log" src/ --include="*.tsx" --include="*.ts"
```

Remove debug console.logs, keep intentional error logging.

---

## 5. Bundle Analysis

Run:
```bash
npm run build
```

Check output for:
- Unusually large chunks
- Duplicate dependencies

Optional: Add bundle analyzer if not present

---

## 6. Documentation Cleanup

Review `/docs` folder for outdated implementation specs that are now complete:
- `TODAY_REVIEW_IMPLEMENTATION.md` - complete, can archive or delete
- `UI_FIXES_*.md` - complete
- `FEATURE_*.md` - complete
- `REMOVE_DRAG_HANDLES.md` - complete
- `UNIFIED_VIEW_TOGGLE.md` - complete
- `BUG_CALENDAR_TOKEN_REFRESH.md` - complete
- `FIX_*.md` - complete

Decide: Delete completed specs or move to `/docs/archive/`?

---

## 7. Type Safety Check

Run full type check:
```bash
npx tsc --noEmit --strict
```

Fix any type errors or `any` types that should be properly typed.

---

## 8. Test Health

Run all tests:
```bash
npm test
```

Ensure no skipped or failing tests.

---

## Report Back

After running through this checklist, report:
1. Files deleted
2. Dependencies updated
3. Dead code removed
4. Console.logs cleaned
5. Any issues found
