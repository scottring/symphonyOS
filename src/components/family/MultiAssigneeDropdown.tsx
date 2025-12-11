import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'

interface MultiAssigneeDropdownProps {
  members: FamilyMember[]
  selectedIds: string[]
  onSelect: (memberIds: string[]) => void
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
}

export function MultiAssigneeDropdown({
  members,
  selectedIds,
  onSelect,
  size = 'md',
  label = 'Assign to family members'
}: MultiAssigneeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedMembers = members.filter(m => selectedIds.includes(m.id))

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

  const handleToggleMember = (memberId: string) => {
    if (selectedIds.includes(memberId)) {
      onSelect(selectedIds.filter(id => id !== memberId))
    } else {
      onSelect([...selectedIds, memberId])
    }
  }

  const handleSelectAll = () => {
    onSelect(members.map(m => m.id))
  }

  const handleClearAll = () => {
    onSelect([])
  }

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-xl shadow-lg border border-neutral-200 py-2 min-w-[220px] animate-fade-in-up"
      style={{
        top: menuPosition.top,
        right: menuPosition.right,
      }}
    >
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wide">
        {label}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-100 mb-1">
        <button
          onClick={handleSelectAll}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          Select all
        </button>
        <span className="text-neutral-300">|</span>
        <button
          onClick={handleClearAll}
          className="text-xs text-neutral-500 hover:text-neutral-700 font-medium"
        >
          Clear
        </button>
      </div>

      {/* Family members with checkboxes */}
      {members.map(member => {
        const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
        const isSelected = selectedIds.includes(member.id)

        return (
          <button
            key={member.id}
            onClick={() => handleToggleMember(member.id)}
            className={`
              w-full px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 transition-colors
              ${isSelected ? 'bg-primary-50/50' : ''}
            `}
          >
            {/* Checkbox */}
            <div className={`
              w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
              ${isSelected
                ? 'bg-primary-500 border-primary-500'
                : 'border-neutral-300 hover:border-primary-400'
              }
            `}>
              {isSelected && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>

            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${colors.bg} ${colors.text}`}>
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                member.initials
              )}
            </div>

            {/* Name */}
            <span className="text-sm text-neutral-800 flex-1 text-left">{member.name}</span>
          </button>
        )
      })}

      {/* Selection summary */}
      {selectedIds.length >= 2 && (
        <div className="mt-1 pt-2 px-3 border-t border-neutral-100">
          <div className="flex items-center gap-1 text-xs text-primary-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            <span>Shared event — subway lines will converge!</span>
          </div>
        </div>
      )}
    </div>
  ) : null

  return (
    <div ref={triggerRef} className="relative">
      {/* Trigger: stacked avatars or empty state */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center -space-x-2 cursor-pointer hover:opacity-80 transition-opacity
          ${selectedMembers.length === 0 ? 'opacity-50' : ''}
        `}
        aria-label={`${selectedMembers.length} assigned. Click to change.`}
      >
        {selectedMembers.length > 0 ? (
          <>
            {selectedMembers.slice(0, 3).map((member, i) => {
              const colors = FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
              return (
                <div
                  key={member.id}
                  className={`
                    ${sizeClasses[size]}
                    rounded-full flex items-center justify-center font-semibold
                    ${colors.bg} ${colors.text}
                    border-2 border-white shadow-sm
                  `}
                  style={{ zIndex: 10 - i }}
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
              <div
                className={`
                  ${sizeClasses[size]}
                  rounded-full flex items-center justify-center font-semibold
                  bg-neutral-200 text-neutral-600
                  border-2 border-white shadow-sm
                `}
              >
                +{selectedMembers.length - 3}
              </div>
            )}
          </>
        ) : (
          <div
            className={`
              ${sizeClasses[size]}
              rounded-full flex items-center justify-center
              bg-neutral-100 text-neutral-400
              border-2 border-dashed border-neutral-300
            `}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
            </svg>
          </div>
        )}
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}
