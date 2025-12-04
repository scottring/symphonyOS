import { useState } from 'react'
import type { FamilyMember } from '@/types/family'

interface FamilySetupProps {
  members: FamilyMember[]
  onAddMember: (member: Omit<FamilyMember, 'id' | 'user_id' | 'created_at'>) => Promise<FamilyMember>
  onUpdateMember: (id: string, updates: Partial<FamilyMember>) => Promise<FamilyMember>
  onDeleteMember: (id: string) => Promise<void>
  onContinue: () => void
}

const COLORS = [
  { value: 'blue', bg: 'bg-blue-500', label: 'Blue' },
  { value: 'purple', bg: 'bg-purple-500', label: 'Purple' },
  { value: 'green', bg: 'bg-green-500', label: 'Green' },
  { value: 'orange', bg: 'bg-orange-500', label: 'Orange' },
  { value: 'pink', bg: 'bg-pink-500', label: 'Pink' },
  { value: 'teal', bg: 'bg-teal-500', label: 'Teal' },
]

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    pink: 'bg-pink-500',
    teal: 'bg-teal-500',
  }
  return colorMap[color] || 'bg-neutral-400'
}

function generateInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase()
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function FamilySetup({
  members,
  onAddMember,
  onUpdateMember: _onUpdateMember,
  onDeleteMember,
  onContinue,
}: FamilySetupProps) {
  void _onUpdateMember // Reserved for future inline editing
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAdd = async () => {
    if (!newName.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onAddMember({
        name: newName.trim(),
        initials: generateInitials(newName),
        color: newColor,
        is_full_user: false,
        display_order: members.length,
        avatar_url: null,
      })
      setNewName('')
      setNewColor('blue')
      setIsAdding(false)
    } catch (err) {
      console.error('Failed to add member:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const member = members.find(m => m.id === id)
    if (member?.is_full_user) return // Can't delete main user
    await onDeleteMember(id)
  }

  const mainUser = members.find(m => m.is_full_user)
  const otherMembers = members.filter(m => !m.is_full_user)

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          Who's in your household?
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-8">
          Add the people who share your life (and your to-do list).
        </p>

        {/* Main user */}
        {mainUser && (
          <div className="mb-6">
            <label className="block text-sm text-neutral-500 mb-2">You</label>
            <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-neutral-100">
              <div className={`w-10 h-10 rounded-full ${getColorClass(mainUser.color)} flex items-center justify-center text-white font-medium`}>
                {mainUser.initials}
              </div>
              <span className="text-neutral-700 font-medium flex-1">{mainUser.name}</span>
              <span className="text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded">Account owner</span>
            </div>
          </div>
        )}

        {/* Family members */}
        <div className="mb-6">
          <label className="block text-sm text-neutral-500 mb-2">Family members</label>

          {otherMembers.length > 0 ? (
            <ul className="space-y-2 mb-4">
              {otherMembers.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 p-4 bg-white rounded-lg border border-neutral-100"
                >
                  <div className={`w-10 h-10 rounded-full ${getColorClass(member.color)} flex items-center justify-center text-white font-medium`}>
                    {member.initials}
                  </div>
                  <span className="text-neutral-700 font-medium flex-1">{member.name}</span>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="text-neutral-400 hover:text-red-500 text-sm"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-neutral-400 text-sm mb-4 text-center py-4">
              No family members added yet
            </p>
          )}

          {/* Add member form */}
          {isAdding ? (
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                className="input-base w-full mb-3"
                autoFocus
              />

              <div className="flex gap-2 mb-4">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setNewColor(color.value)}
                    className={`w-8 h-8 rounded-full ${color.bg} transition-transform ${
                      newColor === color.value ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110' : ''
                    }`}
                    title={color.label}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsAdding(false)
                    setNewName('')
                  }}
                  className="btn-secondary flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || isSubmitting}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full p-3 border-2 border-dashed border-neutral-200 rounded-lg text-neutral-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              + Add family member
            </button>
          )}
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            onClick={onContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
