# Family Member Assignment

**Date:** 2025-12-04
**Priority:** High
**Status:** Not Started

---

## Overview

Add the ability to assign tasks and routines to family members. Each card displays an avatar showing who is responsible, and tapping the avatar opens a dropdown to assign/reassign.

**Family Members (Initial):**
- Scott (full user) — blue
- Iris (full user later) — purple
- Ella (assignee only) — green
- Kaleb (assignee only) — orange

**Behavior:**
- Tasks default to assigned to the current user (Scott)
- Routines have an assigned_to field
- Routine instances can override the routine's assignment for a specific day

---

## Task 1: Database Migration

**Create file:** `supabase/migrations/20241204_family_members.sql`

```sql
-- Family members table
create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  initials text not null,
  color text not null,
  avatar_url text,
  is_full_user boolean default false,
  display_order int default 0,
  created_at timestamptz default now()
);

-- RLS for family_members
alter table family_members enable row level security;

create policy "Users can view their own family members"
  on family_members for select
  using (auth.uid() = user_id);

create policy "Users can insert their own family members"
  on family_members for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own family members"
  on family_members for update
  using (auth.uid() = user_id);

create policy "Users can delete their own family members"
  on family_members for delete
  using (auth.uid() = user_id);

-- Add assigned_to to tasks
alter table tasks 
  add column if not exists assigned_to uuid references family_members(id);

-- Add assigned_to to routines
alter table routines
  add column if not exists assigned_to uuid references family_members(id);

-- Add assigned_to_override to actionable_instances
alter table actionable_instances
  add column if not exists assigned_to_override uuid references family_members(id);

-- Index for faster lookups
create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_routines_assigned_to on routines(assigned_to);
create index if not exists idx_family_members_user_id on family_members(user_id);
```

**Run the migration:**
```bash
cd supabase
supabase db push
```

---

## Task 2: TypeScript Types

**Update file:** `src/types/family.ts` (create new file)

```typescript
export interface FamilyMember {
  id: string
  user_id: string
  name: string
  initials: string
  color: string
  avatar_url: string | null
  is_full_user: boolean
  display_order: number
  created_at: string
}

export type FamilyMemberColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'

export const FAMILY_COLORS: Record<FamilyMemberColor, { bg: string; text: string; ring: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-300' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-300' },
  green: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-300' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700', ring: 'ring-pink-300' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', ring: 'ring-teal-300' },
}
```

**Update file:** `src/types/task.ts`

Add to the Task interface:
```typescript
assigned_to?: string | null
```

**Update file:** `src/types/actionable.ts`

Add to the Routine interface:
```typescript
assigned_to?: string | null
```

Add to the ActionableInstance interface:
```typescript
assigned_to_override?: string | null
```

---

## Task 3: useFamilyMembers Hook

**Create file:** `src/hooks/useFamilyMembers.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { FamilyMember } from '@/types/family'

export function useFamilyMembers() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchMembers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })

      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      console.error('Error fetching family members:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch family members'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const addMember = useCallback(async (member: Omit<FamilyMember, 'id' | 'user_id' | 'created_at'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('family_members')
        .insert({ ...member, user_id: user.id })
        .select()
        .single()

      if (error) throw error
      setMembers(prev => [...prev, data])
      return data
    } catch (err) {
      console.error('Error adding family member:', err)
      throw err
    }
  }, [])

  const updateMember = useCallback(async (id: string, updates: Partial<FamilyMember>) => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      setMembers(prev => prev.map(m => m.id === id ? data : m))
      return data
    } catch (err) {
      console.error('Error updating family member:', err)
      throw err
    }
  }, [])

  const deleteMember = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('id', id)

      if (error) throw error
      setMembers(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Error deleting family member:', err)
      throw err
    }
  }, [])

  // Helper to get member by ID
  const getMember = useCallback((id: string | null | undefined): FamilyMember | undefined => {
    if (!id) return undefined
    return members.find(m => m.id === id)
  }, [members])

  // Helper to get the current user's family member record
  const getCurrentUserMember = useCallback((): FamilyMember | undefined => {
    return members.find(m => m.is_full_user)
  }, [members])

  return {
    members,
    loading,
    error,
    addMember,
    updateMember,
    deleteMember,
    getMember,
    getCurrentUserMember,
    refetch: fetchMembers,
  }
}
```

---

## Task 4: Seed Initial Family Members

After migration runs, we need to seed the initial family members. This can be done via a one-time script or manually.

**Create file:** `scripts/seed-family-members.ts` (for reference, run via Supabase SQL editor)

For now, add this SQL to the migration file OR run manually in Supabase dashboard:

```sql
-- NOTE: Run this AFTER creating a user account
-- Replace 'YOUR_USER_ID' with the actual auth.users id

-- To find your user ID, run:
-- select id from auth.users where email = 'your-email@example.com';

-- Then insert family members:
/*
insert into family_members (user_id, name, initials, color, is_full_user, display_order)
values 
  ('YOUR_USER_ID', 'Scott', 'SK', 'blue', true, 0),
  ('YOUR_USER_ID', 'Iris', 'IR', 'purple', false, 1),
  ('YOUR_USER_ID', 'Ella', 'EL', 'green', false, 2),
  ('YOUR_USER_ID', 'Kaleb', 'KA', 'orange', false, 3);
*/
```

**Alternative: Auto-seed on first load**

Add to `useFamilyMembers.ts` after the fetchMembers function:

```typescript
// Auto-seed if no members exist (first-time setup)
useEffect(() => {
  async function seedIfEmpty() {
    if (!loading && members.length === 0) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Seed default family
      const defaultMembers = [
        { name: 'Scott', initials: 'SK', color: 'blue', is_full_user: true, display_order: 0, avatar_url: null },
        { name: 'Iris', initials: 'IR', color: 'purple', is_full_user: false, display_order: 1, avatar_url: null },
        { name: 'Ella', initials: 'EL', color: 'green', is_full_user: false, display_order: 2, avatar_url: null },
        { name: 'Kaleb', initials: 'KA', color: 'orange', is_full_user: false, display_order: 3, avatar_url: null },
      ]

      const { data, error } = await supabase
        .from('family_members')
        .insert(defaultMembers.map(m => ({ ...m, user_id: user.id })))
        .select()

      if (!error && data) {
        setMembers(data)
      }
    }
  }
  seedIfEmpty()
}, [loading, members.length])
```

---

## Task 5: AssigneeAvatar Component

**Create file:** `src/components/family/AssigneeAvatar.tsx`

```typescript
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'

interface AssigneeAvatarProps {
  member: FamilyMember | undefined
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
}

export function AssigneeAvatar({ member, size = 'md', onClick, className = '' }: AssigneeAvatarProps) {
  const colors = member 
    ? FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
    : { bg: 'bg-neutral-100', text: 'text-neutral-400', ring: 'ring-neutral-200' }

  const initials = member?.initials || '?'
  const name = member?.name || 'Unassigned'

  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center font-semibold
        ${colors.bg} ${colors.text}
        ${onClick ? 'cursor-pointer hover:ring-2 active:scale-95 transition-all' : ''}
        ${onClick ? colors.ring : ''}
        ${className}
      `}
      title={name}
      aria-label={onClick ? `Assigned to ${name}. Click to change.` : `Assigned to ${name}`}
    >
      {member?.avatar_url ? (
        <img 
          src={member.avatar_url} 
          alt={name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </Component>
  )
}
```

---

## Task 6: AssigneeDropdown Component

**Create file:** `src/components/family/AssigneeDropdown.tsx`

```typescript
import { useState, useRef, useEffect } from 'react'
import { AssigneeAvatar } from './AssigneeAvatar'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'

interface AssigneeDropdownProps {
  members: FamilyMember[]
  selectedId: string | null | undefined
  onSelect: (memberId: string | null) => void
  size?: 'sm' | 'md' | 'lg'
}

export function AssigneeDropdown({ members, selectedId, onSelect, size = 'md' }: AssigneeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedMember = members.find(m => m.id === selectedId)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleSelect = (memberId: string | null) => {
    onSelect(memberId)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className="relative">
      <AssigneeAvatar
        member={selectedMember}
        size={size}
        onClick={() => setIsOpen(!isOpen)}
      />

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-lg border border-neutral-200 py-2 min-w-[180px] animate-fade-in-up">
          {/* Unassigned option */}
          <button
            onClick={() => handleSelect(null)}
            className={`
              w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
              ${!selectedId ? 'bg-neutral-50' : ''}
            `}
          >
            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm font-semibold">
              ?
            </div>
            <span className="text-sm text-neutral-600">Unassigned</span>
            {!selectedId && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto text-primary-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <div className="h-px bg-neutral-100 my-1" />

          {/* Family members */}
          {members.map(member => {
            const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
            const isSelected = member.id === selectedId

            return (
              <button
                key={member.id}
                onClick={() => handleSelect(member.id)}
                className={`
                  w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
                  ${isSelected ? 'bg-neutral-50' : ''}
                `}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${colors.bg} ${colors.text}`}>
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    member.initials
                  )}
                </div>
                <span className="text-sm text-neutral-800">{member.name}</span>
                {isSelected && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto text-primary-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

---

## Task 7: Create Index Export

**Create file:** `src/components/family/index.ts`

```typescript
export { AssigneeAvatar } from './AssigneeAvatar'
export { AssigneeDropdown } from './AssigneeDropdown'
```

---

## Task 8: Wire into App.tsx

Add the hook to App.tsx and pass family data down.

**File:** `src/App.tsx`

**Step 8a:** Add import at top:
```typescript
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
```

**Step 8b:** Add hook call inside the App component (near other hooks):
```typescript
const { members: familyMembers, getMember, getCurrentUserMember } = useFamilyMembers()
```

**Step 8c:** Pass to TodaySchedule:
```typescript
<TodaySchedule
  // ... existing props
  familyMembers={familyMembers}
  onAssignTask={(taskId, memberId) => {
    handleUpdateTask(taskId, { assigned_to: memberId })
  }}
/>
```

---

## Task 9: Update TodaySchedule

**File:** `src/components/schedule/TodaySchedule.tsx`

**Step 9a:** Add to props interface:
```typescript
familyMembers?: FamilyMember[]
onAssignTask?: (taskId: string, memberId: string | null) => void
```

**Step 9b:** Add import:
```typescript
import type { FamilyMember } from '@/types/family'
```

**Step 9c:** Destructure new props:
```typescript
familyMembers = [],
onAssignTask,
```

**Step 9d:** Pass to ScheduleItem and SwipeableCard:

For ScheduleItem, add:
```typescript
familyMembers={familyMembers}
assignedTo={item.assignedTo}
onAssign={item.type === 'task' && taskId && onAssignTask
  ? (memberId) => onAssignTask(taskId, memberId)
  : undefined
}
```

For SwipeableCard, add similar props.

---

## Task 10: Update ScheduleItem

**File:** `src/components/schedule/ScheduleItem.tsx`

**Step 10a:** Add imports:
```typescript
import { AssigneeDropdown } from '@/components/family'
import type { FamilyMember } from '@/types/family'
```

**Step 10b:** Add to props interface:
```typescript
familyMembers?: FamilyMember[]
assignedTo?: string | null
onAssign?: (memberId: string | null) => void
```

**Step 10c:** Destructure props:
```typescript
familyMembers = [],
assignedTo,
onAssign,
```

**Step 10d:** Add avatar to the card layout (after the title, before the push button):

```typescript
{/* Assignee avatar */}
{familyMembers.length > 0 && onAssign && (
  <div 
    className="shrink-0"
    onClick={(e) => e.stopPropagation()}
  >
    <AssigneeDropdown
      members={familyMembers}
      selectedId={assignedTo}
      onSelect={onAssign}
      size="sm"
    />
  </div>
)}
```

---

## Task 11: Update SwipeableCard

**File:** `src/components/schedule/SwipeableCard.tsx`

Similar to ScheduleItem:

**Step 11a:** Add imports:
```typescript
import { AssigneeDropdown } from '@/components/family'
import type { FamilyMember } from '@/types/family'
```

**Step 11b:** Add to props interface:
```typescript
familyMembers?: FamilyMember[]
assignedTo?: string | null
onAssign?: (memberId: string | null) => void
```

**Step 11c:** Add avatar in the card content, after the title:

```typescript
{/* Assignee avatar */}
{familyMembers.length > 0 && onAssign && (
  <div 
    className="shrink-0"
    onClick={(e) => e.stopPropagation()}
    onTouchStart={(e) => e.stopPropagation()}
  >
    <AssigneeDropdown
      members={familyMembers}
      selectedId={assignedTo}
      onSelect={onAssign}
      size="sm"
    />
  </div>
)}
```

Note: `onTouchStart` stopPropagation prevents the swipe handler from activating when tapping the avatar.

---

## Task 12: Update TimelineItem Type

**File:** `src/types/timeline.ts`

Add to TimelineItem interface:
```typescript
assignedTo?: string | null
```

Update the `taskToTimelineItem` function to include:
```typescript
assignedTo: task.assigned_to,
```

---

## Task 13: Update useSupabaseTasks

**File:** `src/hooks/useSupabaseTasks.ts`

Ensure `assigned_to` is included in:
1. The select query
2. The insert (default to current user's family member ID)
3. The update function

For defaulting on create, the hook needs access to the current user's family member ID. This can be passed in or looked up.

**Option A (simpler):** Let the caller pass `assigned_to` on create
**Option B:** Hook fetches current user's family member ID internally

For now, use Option A — the QuickCapture or wherever tasks are created passes the current user's family member ID.

---

## Task 14: Update InboxTaskCard

**File:** `src/components/schedule/InboxTaskCard.tsx`

Add the AssigneeDropdown similar to ScheduleItem, positioned appropriately within the card layout.

---

## Verification

After implementation:

```bash
npm run lint
npm test -- --run
npm run build
```

**Manual testing:**
1. App loads without errors
2. Family members are seeded on first load
3. Tasks show assignee avatar (defaults to Scott)
4. Tapping avatar opens dropdown
5. Selecting a family member updates the task
6. Routines show assignee avatar
7. Assigning a routine instance overrides for that day only

---

## Future Enhancements

- [ ] Settings page to manage family members (add/edit/remove)
- [ ] Filter by assignee ("Show: Everyone | Just me | Iris")
- [ ] Link Iris's auth account to her family member record
- [ ] Notification when assigned a task
- [ ] Distinct avatars for kids vs adults
