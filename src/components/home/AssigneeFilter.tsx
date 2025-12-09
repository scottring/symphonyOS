import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'

interface AssigneeFilterProps {
  selectedAssignee: string | null // null = "All"
  onSelectAssignee: (id: string | null) => void
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

// Unassigned icon (user with question mark)
function UnassignedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      <circle cx="18" cy="18" r="4" fill="white" stroke="currentColor" strokeWidth={1.5} />
      <text x="18" y="21" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="bold">?</text>
    </svg>
  )
}

export function AssigneeFilter({
  selectedAssignee,
  onSelectAssignee,
  assigneesWithTasks,
  hasUnassignedTasks,
}: AssigneeFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedMember = assigneesWithTasks.find(m => m.id === selectedAssignee)
  const isUnassignedSelected = selectedAssignee === 'unassigned'
  const isFiltered = selectedAssignee !== null

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

  const handleSelect = (id: string | null) => {
    onSelectAssignee(id)
    setIsOpen(false)
  }

  // Get colors for selected member's avatar in button
  const getButtonContent = () => {
    if (isUnassignedSelected) {
      return (
        <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center">
          <UnassignedIcon className="w-4 h-4 text-neutral-500" />
        </div>
      )
    }

    if (selectedMember) {
      const colors = FAMILY_COLORS[selectedMember.color as FamilyMemberColor] || FAMILY_COLORS.blue
      return (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
          {selectedMember.avatar_url ? (
            <img src={selectedMember.avatar_url} alt={selectedMember.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            selectedMember.initials
          )}
        </div>
      )
    }

    return <FilterIcon className="w-5 h-5" />
  }

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-xl shadow-lg border border-neutral-200 py-2 min-w-[160px] animate-fade-in-up"
      style={{
        top: menuPosition.top,
        right: menuPosition.right,
      }}
    >
      {/* All option */}
      <button
        onClick={() => handleSelect(null)}
        className={`
          w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
          ${selectedAssignee === null ? 'bg-neutral-50' : ''}
        `}
      >
        <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
          <FilterIcon className="w-4 h-4" />
        </div>
        <span className="text-sm text-neutral-700 font-medium">All</span>
        {selectedAssignee === null && (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto text-primary-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {(assigneesWithTasks.length > 0 || hasUnassignedTasks) && (
        <div className="h-px bg-neutral-100 my-1" />
      )}

      {/* Family members with tasks */}
      {assigneesWithTasks.map(member => {
        const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
        const isSelected = member.id === selectedAssignee

        return (
          <button
            key={member.id}
            onClick={() => handleSelect(member.id)}
            className={`
              w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
              ${isSelected ? 'bg-neutral-50' : ''}
            `}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${colors.bg} ${colors.text}`}>
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

      {/* Unassigned option */}
      {hasUnassignedTasks && (
        <button
          onClick={() => handleSelect('unassigned')}
          className={`
            w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
            ${isUnassignedSelected ? 'bg-neutral-50' : ''}
          `}
        >
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
          {isUnassignedSelected && (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto text-primary-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
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
        `}
      >
        {getButtonContent()}
        {/* Active filter indicator */}
        {isFiltered && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-500" />
        )}
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </>
  )
}
