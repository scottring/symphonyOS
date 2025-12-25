# Family Member Management - Implementation Task

## Overview

Family members are auto-seeded with hardcoded values. Fix the auto-seed and create a Settings page for ongoing management.

## What Already Exists

- `FamilySetup.tsx` in onboarding - has add/delete UI
- `useFamilyMembers` hook with full CRUD
- `family_members` table in Supabase
- Color picker UI in onboarding step

## Implementation Steps

### Step 1: Fix Auto-Seed in useFamilyMembers.ts

**File:** `src/hooks/useFamilyMembers.ts`

**Find this block (around line 47-56):**
```typescript
const defaultMembers = [
  { name: 'Scott', initials: 'SK', color: 'blue', is_full_user: true, display_order: 0, avatar_url: null },
  { name: 'Iris', initials: 'IR', color: 'purple', is_full_user: false, display_order: 1, avatar_url: null },
  { name: 'Ella', initials: 'EL', color: 'green', is_full_user: false, display_order: 2, avatar_url: null },
  { name: 'Kaleb', initials: 'KA', color: 'orange', is_full_user: false, display_order: 3, avatar_url: null },
]
```

**Replace with:**
```typescript
// Only seed the current user - they'll add family in onboarding
const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me'
const initials = userName.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase()

const defaultMembers = [
  { name: userName, initials, color: 'blue', is_full_user: true, display_order: 0, avatar_url: null },
]
```

### Step 2: Create Settings Page

**Create:** `src/components/settings/SettingsPage.tsx`

This should be a new page accessible from the main navigation. Include:

1. **Header** - "Settings" title with back button
2. **Family Members section** - reuse patterns from `FamilySetup.tsx`:
   - List all family members with avatar, name, color
   - "You" badge on the main user
   - Remove button on non-main users
   - Edit button on each member (new functionality)
   - Add member button at bottom

3. **Edit functionality** (new):
   - Click edit → inline edit or modal
   - Can change name, initials, color
   - Cannot edit `is_full_user` flag

**Reference:** Look at `src/components/onboarding/steps/FamilySetup.tsx` for the UI patterns - the Settings version should look similar but work standalone (not in wizard context).

### Step 3: Add Settings Route

**File:** `src/App.tsx`

Add a new view/route for Settings. The navigation could be:
- Gear icon in header or sidebar
- Or add to existing navigation pattern

### Step 4: Create FamilyMemberCard Component (Optional Refactor)

If there's significant duplication between FamilySetup and SettingsPage, extract a shared `FamilyMemberCard` component to `src/components/family/`.

### Step 5: Add Edit Member Modal

**Create:** `src/components/settings/EditMemberModal.tsx` (or inline editing)

Fields:
- Name (text input)
- Initials (auto-generated from name, but editable)
- Color (color picker - reuse from FamilySetup)

Use the existing `updateMember` function from `useFamilyMembers` hook.

## File Structure

```
src/components/settings/
  ├── SettingsPage.tsx       # Main settings page
  ├── FamilyMemberList.tsx   # List of family members
  └── EditMemberModal.tsx    # Edit modal
```

Or simpler - just one `SettingsPage.tsx` with everything inline if it's not too complex.

## Testing

1. **New user flow:**
   - Create new account
   - Should see only self in family (not Scott/Iris/Ella/Kaleb)
   - Onboarding should let them add family members

2. **Settings flow:**
   - Can access Settings from main app
   - Can see all family members
   - Can edit any member's name/color
   - Can remove non-main members
   - Can add new members
   - Cannot remove self (main user)

## Verification

```bash
npm run build
npm run lint
npm test -- --run
```

## Design Reference

See `docs/design/FAMILY-MANAGEMENT.md` for wireframes and full design context.
