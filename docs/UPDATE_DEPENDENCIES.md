# Update Dependencies (Minor Versions)

## Update these packages (minor/patch versions only):

```bash
npm update @supabase/supabase-js @types/node @vitejs/plugin-react react react-dom react-router-dom typescript-eslint vite
```

## Do NOT update:
- vitest (major version 2.x → 3.x requires separate review)

## After updating:

1. Run `npm install` to ensure lockfile is updated
2. Run `npm run build` to verify build still works
3. Run `npm test` to verify tests still pass
4. Report any issues

## Expected result:
All minor version updates should be backward compatible.
