# Family Member Management

**Status:** Design  
**Priority:** High - blocks beta testing  
**Created:** Dec 6, 2025

## Problem

Family members are currently auto-seeded with hardcoded values (Scott/Iris/Ella/Kaleb). This means:
- Other users get the wrong family on signup
- No way to add, edit, or remove family members
- No onboarding flow to set up your family

## Current State

### What exists:
- `family_members` table in Supabase
- `useFamilyMembers` hook with full CRUD (`addMember`, `updateMember`, `deleteMember`)
- `FamilyMember` type with: `id`, `name`, `initials`, `color`, `is_full_user`, `display_order`, `avatar_url`
- `AssigneeDropdown` component for assigning tasks to family members
- **`FamilySetup.tsx` onboarding step** - already has add/delete UI with color picker

### What's broken:
- Auto-seed in `useFamilyMembers.ts` hardcodes Scott's family
- No Settings page to manage family AFTER onboarding
- No edit functionality (only add/delete)

## Design

### 1. Fix Auto-Seed Behavior

**Current (bad):**
```typescript
const defaultMembers = [
  { name: 'Scott', initials: 'SK', color: 'blue', is_full_user: true, ... },
  { name: 'Iris', initials: 'IR', color: 'purple', ... },
  // etc
]
```

**New behavior:**
- On first login, seed ONLY the current user as a family member
- Get name from auth profile if available, otherwise prompt
- Set `is_full_user: true` for the creating user
- No other members seeded - user adds them manually

```typescript
const { data: { user } } = await supabase.auth.getUser()
const defaultMember = {
  name: user.user_metadata?.full_name || 'Me',
  initials: getInitials(user.user_metadata?.full_name || user.email),
  color: 'blue',
  is_full_user: true,
  display_order: 0,
  avatar_url: user.user_metadata?.avatar_url || null
}
```

### 2. Family Management UI

**Location:** Settings page (gear icon in header/sidebar)

**Layout:**
```
┌─────────────────────────────────────┐
│ Settings                            │
├─────────────────────────────────────┤
│                                     │
│ Family Members                      │
│ ─────────────────────────────────── │
│                                     │
│ ┌─────┐ Scott (You)           ✎ ✕  │
│ │ SK  │ Full account                │
│ └─────┘                             │
│                                     │
│ ┌─────┐ Iris                  ✎ ✕  │
│ │ IR  │                             │
│ └─────┘                             │
│                                     │
│ ┌─────┐ Ella                  ✎ ✕  │
│ │ EL  │                             │
│ └─────┘                             │
│                                     │
│ ┌─────┐ Kaleb                 ✎ ✕  │
│ │ KA  │                             │
│ └─────┘                             │
│                                     │
│ [ + Add Family Member ]             │
│                                     │
└─────────────────────────────────────┘
```

**Add/Edit Modal:**
```
┌─────────────────────────────────────┐
│ Add Family Member                   │
├─────────────────────────────────────┤
│                                     │
│ Name                                │
│ ┌─────────────────────────────────┐ │
│ │ Iris                            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Initials (auto-generated)           │
│ ┌───────┐                           │
│ │ IR    │                           │
│ └───────┘                           │
│                                     │
│ Color                               │
│ ● Blue  ○ Purple  ○ Green           │
│ ○ Orange  ○ Pink  ○ Teal            │
│                                     │
│        [ Cancel ]  [ Save ]         │
│                                     │
└─────────────────────────────────────┘
```

### 3. Onboarding Integration

**Already exists!** `src/components/onboarding/steps/FamilySetup.tsx`

The onboarding wizard already has a family setup step that:
- Shows the main user with "Account owner" badge
- Lets users add family members with name and color
- Lets users remove family members

No changes needed to onboarding - just fix the auto-seed so users start with only themselves.

### 4. Delete Protection

- Cannot delete yourself (the `is_full_user: true` member)
- Deleting a member with assigned tasks: prompt to reassign or unassign
- Soft confirmation: "Remove Ella from your family?"

## Components Needed

1. **SettingsPage.tsx** - New page (or add to existing if there is one)
2. **FamilyMemberList.tsx** - List of family members with edit/delete
3. **FamilyMemberCard.tsx** - Individual member display
4. **FamilyMemberModal.tsx** - Add/Edit modal
5. **ColorPicker.tsx** - Simple color selection (may already exist)

## Database

No schema changes needed - `family_members` table already has all required fields.

## Implementation Order

1. Fix auto-seed to only create current user (critical)
2. Create Settings page with family list
3. Add edit functionality (name, color)
4. Reuse add/delete patterns from FamilySetup.tsx

## Open Questions

1. **Drag to reorder?** - Nice to have for display_order, but not critical for MVP
2. ~~Avatar upload?~~ - **Decided: Skip for now, use initials**
3. **Invite flow?** - For `is_full_user` members who get their own login. Future feature.

## Success Criteria

- [ ] New users see only themselves on first login (not Scott's family)
- [ ] Onboarding family setup works correctly (already exists)
- [ ] Settings page accessible from main app
- [ ] Users can add family members from Settings
- [ ] Users can edit family member names/colors from Settings
- [ ] Users can remove family members (except themselves)
- [ ] AssigneeDropdown shows the user's actual family
