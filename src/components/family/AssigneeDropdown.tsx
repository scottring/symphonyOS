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
            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
              </svg>
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
