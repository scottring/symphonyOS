import { createPortal } from 'react-dom'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import type { ScheduleContextItem } from '@/components/triage'
import { DeferPicker, SchedulePopover, ContextPicker } from '@/components/triage'
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
  familyMembers = [],
  lists = [],
  listsByCategory,
  getScheduleItemsForDate,
}: BulkActionToolbarProps) {
  const isMobile = useMobile()

  return createPortal(
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 ${
        isMobile ? 'p-3' : 'pb-6 flex justify-center'
      }`}
    >
      <div
        className={`bg-white rounded-xl border border-neutral-200 shadow-lg ${
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
          {/* Defer */}
          <DeferPicker
            onDefer={onDefer}
          />

          {/* Schedule */}
          <SchedulePopover
            value={undefined}
            isAllDay={undefined}
            onSchedule={onSchedule}
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
      </div>
    </div>,
    document.body
  )
}
