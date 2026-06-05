import { createPortal } from 'react-dom'
import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import type { ScheduleContextItem } from '@/components/triage'
import { SchedulePopover, ContextPicker } from '@/components/triage'
import { ListPicker } from '@/components/triage/ListPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { useMobile } from '@/hooks/useMobile'

interface BulkActionToolbarProps {
  selectedCount: number
  onDefer: (target: 'week' | 'month' | 'quarter') => void
  onSchedule: (date: Date, isAllDay: boolean) => void
  onSetContext: (context: TaskContext | undefined) => void
  onAssign: (memberIds: string[]) => void
  onSendToList: (listId: string) => void
  onCancel: () => void
  onGroup?: (name: string, date: Date, isAllDay: boolean) => void
  // Pass through data for pickers
  familyMembers?: FamilyMember[]
  lists?: List[]
  listsByCategory?: Record<ListCategory, List[]>
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
}

export function BulkActionToolbar({
  selectedCount,
  onDefer,
  onSchedule,
  onSetContext,
  onAssign,
  onSendToList,
  onCancel,
  onGroup,
  familyMembers = [],
  lists = [],
  listsByCategory,
  getScheduleItemsForDate,
}: BulkActionToolbarProps) {
  const isMobile = useMobile()

  const [grouping, setGrouping] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDate, setGroupDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [groupIsAllDay, setGroupIsAllDay] = useState(true)

  const openGrouping = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    setGroupDate(d)
    setGroupIsAllDay(true)
    setGroupName('')
    setGrouping(true)
  }
  const submitGroup = () => {
    const name = groupName.trim()
    if (!name || !onGroup) return
    onGroup(name, groupDate, groupIsAllDay)
    setGrouping(false)
  }

  return createPortal(
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 ${
        isMobile ? 'p-3' : 'pb-6 flex justify-center'
      }`}
    >
      <div
        className={`relative bg-white rounded-xl border border-neutral-200 shadow-lg ${
          isMobile
            ? 'p-3 w-full'
            : 'p-4 max-w-2xl flex items-center gap-4'
        }`}
      >
        {/* Count display */}
        <span className={`font-medium text-sm text-neutral-700 ${isMobile ? 'block text-center mb-2' : ''}`}>
          {selectedCount} selected
        </span>

        {/* Actions */}
        <div className={`flex items-center ${isMobile ? 'justify-around' : 'gap-2'}`}>
          {/* Group — wrap selected tasks into a new parent task */}
          {onGroup && (
            <button
              type="button"
              onClick={openGrouping}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              Group
            </button>
          )}

          {/* When — one picker covering both specific days and planning
              horizons (This Week / Next Month / Someday), so there aren't two
              competing "when" buttons. */}
          <SchedulePopover
            value={undefined}
            isAllDay={undefined}
            onSchedule={onSchedule}
            onDefer={onDefer}
            onClear={() => {}}
            getItemsForDate={getScheduleItemsForDate || (() => [])}
            itemTitle={`${selectedCount} tasks`}
          />

          {/* Send to List */}
          {listsByCategory && (
            <ListPicker
              lists={lists}
              listsByCategory={listsByCategory}
              onSendToList={onSendToList}
            />
          )}

          {/* Context - desktop only */}
          {!isMobile && (
            <ContextPicker
              value={undefined}
              onChange={onSetContext}
            />
          )}

          {/* Assign - desktop only */}
          {!isMobile && familyMembers.length > 0 && (
            <MultiAssigneeDropdown
              members={familyMembers}
              selectedIds={[]}
              onSelect={onAssign}
              size="sm"
            />
          )}
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className={`text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors ${
            isMobile ? 'mt-2 w-full text-center py-1' : 'ml-auto'
          }`}
        >
          Cancel
        </button>

        {/* Name + when popover for "Group" */}
        {grouping && onGroup && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
            <input
              autoFocus
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitGroup()
                if (e.key === 'Escape') setGrouping(false)
              }}
              placeholder="Name this group"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <SchedulePopover
                value={groupDate}
                isAllDay={groupIsAllDay}
                onSchedule={(date, isAllDay) => { setGroupDate(date); setGroupIsAllDay(isAllDay) }}
                onClear={() => {}}
                getItemsForDate={getScheduleItemsForDate || (() => [])}
                itemTitle={groupName || 'group'}
              />
              <button
                type="button"
                onClick={submitGroup}
                disabled={!groupName.trim()}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create group
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
