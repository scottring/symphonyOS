// src/hooks/useItemDiscussionLabel.ts
//
// The item panel's discussion button wording, from the household's
// discussions (see src/lib/discussions/itemChip.ts).

import { useMemo } from 'react'
import { useDiscussionInbox } from '@/hooks/useDiscussionInbox'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { discussionChipLabel, discussionFor, otherLoginNames } from '@/lib/discussions/itemChip'
import type { InboxEntityType } from '@/lib/discussions/inbox'
import type { WaitingMember } from '@/lib/discussions/waiting'

export function useItemDiscussionLabel(entityType: InboxEntityType, entityId: string): string {
  const { rows } = useDiscussionInbox()
  const { members, currentUserId } = useFamilyMembers()
  return useMemo(() => discussionChipLabel(
    discussionFor(rows, entityType, entityId),
    otherLoginNames(members as unknown as WaitingMember[], currentUserId ?? null),
  ), [rows, entityType, entityId, members, currentUserId])
}
