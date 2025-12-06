import { useState } from 'react'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import type { FamilyMember } from '@/types/family'

interface SettingsPageProps {
  onBack: () => void
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

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { members, addMember, updateMember, deleteMember } = useFamilyMembers()

  // Add member state
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit member state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('blue')

  const handleAdd = async () => {
    if (!newName.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await addMember({
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
    await deleteMember(id)
  }

  const startEditing = (member: FamilyMember) => {
    setEditingId(member.id)
    setEditName(member.name)
    setEditColor(member.color)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName('')
    setEditColor('blue')
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await updateMember(editingId, {
        name: editName.trim(),
        initials: generateInitials(editName),
        color: editColor,
      })
      cancelEditing()
    } catch (err) {
      console.error('Failed to update member:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const mainUser = members.find(m => m.is_full_user)
  const otherMembers = members.filter(m => !m.is_full_user)

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="font-display text-2xl font-semibold text-neutral-800">Settings</h1>
        </div>

        {/* Family Members Section */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-700 mb-4">Family Members</h2>
          <p className="text-sm text-neutral-500 mb-6">
            Manage the people in your household. You can assign tasks, routines, and events to family members.
          </p>

          {/* Main user */}
          {mainUser && (
            <div className="mb-4">
              <label className="block text-sm text-neutral-500 mb-2">You</label>
              {editingId === mainUser.id ? (
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Name"
                    className="input-base w-full mb-3"
                    autoFocus
                  />

                  <div className="flex gap-2 mb-4">
                    {COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setEditColor(color.value)}
                        className={`w-8 h-8 rounded-full ${color.bg} transition-transform ${
                          editColor === color.value ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110' : ''
                        }`}
                        title={color.label}
                      />
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={cancelEditing}
                      className="btn-secondary flex-1"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editName.trim() || isSubmitting}
                      className="btn-primary flex-1 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-neutral-100">
                  <div className={`w-10 h-10 rounded-full ${getColorClass(mainUser.color)} flex items-center justify-center text-white font-medium`}>
                    {mainUser.initials}
                  </div>
                  <span className="text-neutral-700 font-medium flex-1">{mainUser.name}</span>
                  <span className="text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded">Account owner</span>
                  <button
                    onClick={() => startEditing(mainUser)}
                    className="text-neutral-400 hover:text-neutral-600 p-1"
                    title="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Family members */}
          <div>
            <label className="block text-sm text-neutral-500 mb-2">Family members</label>

            {otherMembers.length > 0 ? (
              <ul className="space-y-2 mb-4">
                {otherMembers.map((member) => (
                  <li key={member.id}>
                    {editingId === member.id ? (
                      <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          className="input-base w-full mb-3"
                          autoFocus
                        />

                        <div className="flex gap-2 mb-4">
                          {COLORS.map((color) => (
                            <button
                              key={color.value}
                              onClick={() => setEditColor(color.value)}
                              className={`w-8 h-8 rounded-full ${color.bg} transition-transform ${
                                editColor === color.value ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110' : ''
                              }`}
                              title={color.label}
                            />
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={cancelEditing}
                            className="btn-secondary flex-1"
                            disabled={isSubmitting}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editName.trim() || isSubmitting}
                            className="btn-primary flex-1 disabled:opacity-50"
                          >
                            {isSubmitting ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-neutral-100">
                        <div className={`w-10 h-10 rounded-full ${getColorClass(member.color)} flex items-center justify-center text-white font-medium`}>
                          {member.initials}
                        </div>
                        <span className="text-neutral-700 font-medium flex-1">{member.name}</span>
                        <button
                          onClick={() => startEditing(member)}
                          className="text-neutral-400 hover:text-neutral-600 p-1"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="text-neutral-400 hover:text-red-500 p-1"
                          title="Remove"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    )}
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
        </section>
      </div>
    </div>
  )
}
