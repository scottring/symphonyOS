import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'

interface AssigneeFilterProps {
  // Support both single and multi-select modes
  selectedAssignees: string[] // empty = "All", ['unassigned'] = unassigned only
  onSelectAssignees: (ids: string[]) => void
  assigneesWithTasks: FamilyMember[] // only those with tasks in current view
  hasUnassignedTasks: boolean
}

// Filter icon
function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

export function AssigneeFilter({
  selectedAssignees,
  onSelectAssignees,
  assigneesWithTasks,
  hasUnassignedTasks,
}: AssigneeFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isAllSelected = selectedAssignees.length === 0
  const isUnassignedSelected = selectedAssignees.includes('unassigned')
  const isFiltered = selectedAssignees.length > 0
  const isMultiSelect = selectedAssignees.filter(id => id !== 'unassigned').length > 1

  // Get selected members (excluding 'unassigned')
  const selectedMembers = assigneesWithTasks.filter(m => selectedAssignees.includes(m.id))

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
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

  // Toggle a member in/out of selection (multi-select behavior)
  const handleToggleMember = (id: string) => {
    if (selectedAssignees.includes(id)) {
      // Remove from selection
      const newSelection = selectedAssignees.filter(s => s !== id)
      onSelectAssignees(newSelection)
    } else {
      // Add to selection (clear 'All' state)
      onSelectAssignees([...selectedAssignees, id])
    }
  }

  // Select only this member (single-click behavior with modifier)
  const handleSelectOnly = (id: string) => {
    onSelectAssignees([id])
    setIsOpen(false)
  }

  // Clear all filters
  const handleSelectAll = () => {
    onSelectAssignees([])
    setIsOpen(false)
  }

  // Get colors for button display
  const getButtonContent = () => {
    // Multi-select: show stacked avatars
    if (selectedMembers.length >= 2) {
      return (
        <div className="flex -space-x-1.5">
          {selectedMembers.slice(0, 3).map((member, idx) => {
            const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
            return (
              <div
                key={member.id}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold border-2 border-white ${colors.bg} ${colors.text}`}
                style={{ zIndex: 3 - idx }}
              >
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  member.initials
                )}
              </div>
            )
          })}
          {selectedMembers.length > 3 && (
            <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center text-[9px] font-medium text-neutral-600 border-2 border-white">
              +{selectedMembers.length - 3}
            </div>
          )}
        </div>
      )
    }

    // Single member selected
    if (selectedMembers.length === 1) {
      const member = selectedMembers[0]
      const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
      return (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
          {member.avatar_url ? (
            <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            member.initials
          )}
        </div>
      )
    }

    // Only unassigned selected
    if (isUnassignedSelected && selectedMembers.length === 0) {
      return (
        <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-neutral-500" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
          </svg>
        </div>
      )
    }

    // Default: all/none selected
    return <FilterIcon className="w-5 h-5" />
  }

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-xl shadow-lg border border-neutral-200 py-2 min-w-[200px] animate-fade-in-up"
      style={{
        top: menuPosition.top,
        right: menuPosition.right,
      }}
    >
      {/* Header with instructions */}
      <div className="px-3 py-1.5 text-xs text-neutral-500 border-b border-neutral-100 mb-1">
        Click to toggle • Select 2+ for river view
      </div>

      {/* All option */}
      <button
        onClick={handleSelectAll}
        className={`
          w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
          ${isAllSelected ? 'bg-neutral-50' : ''}
        `}
      >
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
          <FilterIcon className="w-4 h-4" />
        </div>
        <span className="text-sm text-neutral-700 font-medium">All</span>
        {isAllSelected && (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto text-primary-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {(assigneesWithTasks.length > 0 || hasUnassignedTasks) && (
        <div className="h-px bg-neutral-100 my-1" />
      )}

      {/* Family members with tasks - multi-select */}
      {assigneesWithTasks.map(member => {
        const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
        const isSelected = selectedAssignees.includes(member.id)

        return (
          <button
            key={member.id}
            onClick={(e) => {
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                // Modifier key: select only this one
                handleSelectOnly(member.id)
              } else {
                // Normal click: toggle
                handleToggleMember(member.id)
              }
            }}
            className={`
              w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
              ${isSelected ? 'bg-primary-50/50' : ''}
            `}
          >
            {/* Checkbox indicator */}
            <div className={`
              w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
              ${isSelected ? 'bg-primary-500 border-primary-500' : 'border-neutral-300'}
            `}>
              {isSelected && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${colors.bg} ${colors.text}`}>
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                member.initials
              )}
            </div>
            <span className="text-sm text-neutral-800">{member.name}</span>
          </button>
        )
      })}

      {/* Unassigned option */}
      {hasUnassignedTasks && (
        <button
          onClick={() => handleToggleMember('unassigned')}
          className={`
            w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
            ${isUnassignedSelected ? 'bg-primary-50/50' : ''}
          `}
        >
          <div className={`
            w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
            ${isUnassignedSelected ? 'bg-primary-500 border-primary-500' : 'border-neutral-300'}
          `}>
            {isUnassignedSelected && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm text-neutral-600">Unassigned</span>
        </button>
      )}

      {/* River view indicator when 2+ selected */}
      {isMultiSelect && (
        <div className="px-3 py-2 mt-1 border-t border-neutral-100 flex items-center gap-2 text-xs text-primary-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
          </svg>
          <span>River view active</span>
        </div>
      )}
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        title="Filter by assignee"
        aria-label="Filter by assignee"
        className={`
          relative p-2 rounded-md
          transition-all duration-200 ease-out
          ${isFiltered
            ? 'text-neutral-800 bg-white shadow-sm'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-white/50'
          }
          ${isMultiSelect ? 'ring-2 ring-primary-200' : ''}
        `}
      >
        {getButtonContent()}
        {/* Active filter indicator */}
        {isFiltered && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[0.5rem] h-2 rounded-full ${isMultiSelect ? 'bg-primary-500 w-4 flex items-center justify-center text-[8px] text-white font-bold' : 'bg-primary-500 w-2'}`}>
            {isMultiSelect ? selectedMembers.length : ''}
          </span>
        )}
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </>
  )
}
