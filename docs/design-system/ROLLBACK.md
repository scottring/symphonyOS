# How to Rollback the Redesign

This document explains how to **completely remove** the Kinetic Clarity redesign and return to the original Nordic Journal design.

---

## ✅ Simple Rollback (Recommended)

**Just toggle the theme back to Nordic in the app**:

1. Open **Settings** in the sidebar (gear icon)
2. Go to the **General** tab
3. Under **Appearance**, click on **Nordic Journal**
4. The page will reload with the original Nordic Journal design

**That's it!** Your app will use the original Nordic Journal design, and the preference is saved automatically.

---

## 🗑️ Complete Removal (If You Want to Delete Everything)

If you want to permanently remove all Kinetic Clarity files from the codebase:

### Step 1: Delete New Files

```bash
rm src/kinetic-clarity.css
rm src/config/theme.ts
rm src/components/layout/SidebarKinetic.tsx
rm REDESIGN.md
rm ROLLBACK.md
```

### Step 2: Revert main.tsx

Open `src/main.tsx` and change lines 1-14 back to:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CalendarCallback } from './pages/CalendarCallback'
import { JoinHousehold } from './pages/JoinHousehold'
import { GoogleCalendarProvider } from './hooks/useGoogleCalendar'
```

(Remove the theme import and conditional CSS loading)

### Step 3: Revert AppShell.tsx

Open `src/components/layout/AppShell.tsx`:

1. Remove line 3: `import { SidebarKinetic } from './SidebarKinetic'`
2. Remove line 13: `import { ACTIVE_THEME } from '@/config/theme'`
3. Replace lines 88-119 with:

```tsx
      {/* Sidebar - hidden on mobile */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={onSidebarToggle}
          userEmail={userEmail}
          onSignOut={onSignOut}
          activeView={activeView}
          onViewChange={onViewChange}
          onOpenSearch={onOpenSearch}
          pins={pins}
          entities={entities}
          onPinNavigate={onPinNavigate}
          onPinMarkAccessed={onPinMarkAccessed}
          onPinRefreshStale={onPinRefreshStale}
        />
      )}
```

### Step 4: Verify Build

```bash
npm run build
```

Should complete without errors.

---

## 🔍 Files Modified (For Git Tracking)

If you want to track what changed:

### Modified Files
- `src/main.tsx` - Added theme switcher logic
- `src/components/layout/AppShell.tsx` - Added conditional sidebar rendering

### New Files
- `src/kinetic-clarity.css` - New design system
- `src/config/theme.ts` - Theme configuration
- `src/components/layout/SidebarKinetic.tsx` - New sidebar component
- `REDESIGN.md` - Documentation
- `ROLLBACK.md` - This file

### Untouched (Original) Files
- `src/index.css` - Original Nordic design
- `src/components/layout/Sidebar.tsx` - Original sidebar
- Everything else!

---

## 🌿 Git Workflow

### View Changes
```bash
git status
git diff
```

### Commit the Redesign
```bash
git add .
git commit -m "feat: add Kinetic Clarity design system (reversible)"
git push origin feature/radical-redesign-v2
```

### Revert to Original (If Already Committed)
```bash
# Soft reset (keeps files, undoes commit)
git reset --soft HEAD~1

# Hard reset (deletes everything, dangerous!)
git reset --hard HEAD~1

# Or just checkout main
git checkout main
```

### Keep Both Designs (Merge Strategy)
```bash
# Merge the redesign branch but stay on nordic by default
git checkout main
git merge feature/radical-redesign-v2
# Then set theme.ts to 'nordic'
```

---

## ⚡ Quick Toggle Commands

Create these npm scripts in `package.json` for easy switching:

```json
{
  "scripts": {
    "theme:kinetic": "echo \"export const ACTIVE_THEME = 'kinetic'\" > src/config/theme.ts",
    "theme:nordic": "echo \"export const ACTIVE_THEME = 'nordic'\" > src/config/theme.ts"
  }
}
```

Then run:
```bash
npm run theme:kinetic  # Switch to Kinetic Clarity
npm run theme:nordic   # Switch to Nordic Journal
```

---

## 🆘 Emergency Rollback

If something breaks and you need to roll back immediately:

```bash
# 1. Stash all changes
git stash

# 2. Go back to last known good state
git checkout main

# 3. Force reload without cache
rm -rf node_modules/.vite
npm run dev
```

---

## 📊 Rollback Checklist

- [ ] Changed `ACTIVE_THEME` in `src/config/theme.ts` to `'nordic'`
- [ ] Verified app loads correctly
- [ ] Tested navigation still works
- [ ] Checked mobile view
- [ ] Ran `npm run build` successfully

If all checkboxes pass, rollback is complete! ✅

---

## 💬 Questions?

- **Theme not switching?** - Hard refresh browser (Cmd+Shift+R on Mac)
- **Build errors?** - Run `npm clean-install` to reinstall dependencies
- **Styles look wrong?** - Clear browser cache and Vite cache (`rm -rf .vite`)

---

**Your original Nordic Journal design is safe and intact!** 🎨
