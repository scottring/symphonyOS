import { useState, useCallback } from 'react'
import type { FamilyMember, Household, MemberType, AgeRange } from '@/types/family'

interface HouseholdSetupProps {
  household: Household | null
  members: FamilyMember[]
  onUpdateHousehold: (updates: Partial<Household>) => Promise<void>
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

const CORE_ROLES = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'family', label: 'Other family' },
]

const GUEST_ROLES = [
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'babysitter', label: 'Babysitter' },
  { value: 'nanny', label: 'Nanny' },
  { value: 'relative', label: 'Relative' },
  { value: 'family-friend', label: 'Family friend' },
  { value: 'playdate', label: 'Playdate regular' },
  { value: 'other', label: 'Other' },
]

const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: 'infant', label: '0–1' },
  { value: 'toddler', label: '2–4' },
  { value: 'child', label: '5–12' },
  { value: 'teen', label: '13–17' },
  { value: 'adult', label: '18+' },
]

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500',
    orange: 'bg-orange-500', pink: 'bg-pink-500', teal: 'bg-teal-500',
  }
  return colorMap[color] || 'bg-neutral-400'
}

function generateInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// ─── Add Member Form ────────────────────────────────────────────────
interface AddMemberFormProps {
  type: MemberType
  onAdd: (data: {
    name: string
    color: string
    role_label: string
    age_range?: AgeRange
    typical_involvement?: string
  }) => Promise<void>
  onCancel: () => void
}

function AddMemberForm({ type, onAdd, onCancel }: AddMemberFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  const [roleLabel, setRoleLabel] = useState(type === 'core' ? 'parent' : 'grandparent')
  const [ageRange, setAgeRange] = useState<AgeRange>('adult')
  const [involvement, setInvolvement] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const roles = type === 'core' ? CORE_ROLES : GUEST_ROLES
  const isChild = type === 'core' && roleLabel === 'child'

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await onAdd({
        name: name.trim(),
        color,
        role_label: roleLabel,
        age_range: isChild ? ageRange : 'adult',
        typical_involvement: type === 'guest' ? involvement.trim() || undefined : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-5 rounded-xl border border-neutral-200 bg-white/80 space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-neutral-600 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'core' ? 'e.g. Rowan' : 'e.g. Grandma Carol'}
          className="input-base w-full"
          autoFocus
        />
      </div>

      {/* Role */}
      <div>
        <label className="block text-sm font-medium text-neutral-600 mb-1">Role</label>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role.value}
              onClick={() => setRoleLabel(role.value)}
              className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                roleLabel === role.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>

      {/* Age range (for children) */}
      {isChild && (
        <div>
          <label className="block text-sm font-medium text-neutral-600 mb-1">Age range</label>
          <div className="flex flex-wrap gap-2">
            {AGE_RANGES.filter(a => a.value !== 'adult').map((age) => (
              <button
                key={age.value}
                onClick={() => setAgeRange(age.value)}
                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                  ageRange === age.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {age.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Typical involvement (for guests) */}
      {type === 'guest' && (
        <div>
          <label className="block text-sm font-medium text-neutral-600 mb-1">
            Typical involvement
          </label>
          <input
            type="text"
            value={involvement}
            onChange={(e) => setInvolvement(e.target.value)}
            placeholder="e.g. picks up Tuesdays, babysits Thursday evenings"
            className="input-base w-full"
          />
          <p className="text-xs text-neutral-400 mt-1">
            How does this person typically help or participate?
          </p>
        </div>
      )}

      {/* Color picker */}
      <div>
        <label className="block text-sm font-medium text-neutral-600 mb-1">Color</label>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              className={`w-8 h-8 rounded-full ${c.bg} transition-transform ${
                color === c.value ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110' : ''
              }`}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="btn-secondary flex-1" disabled={submitting}>
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  )
}

// ─── Member Card ────────────────────────────────────────────────────
function MemberCard({
  member,
  onDelete,
  isMainUser,
}: {
  member: FamilyMember
  onDelete?: () => void
  isMainUser?: boolean
}) {
  return (
    <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-neutral-100">
      <div
        className={`w-10 h-10 rounded-full ${getColorClass(member.color)} flex items-center justify-center text-white font-medium text-sm shrink-0`}
      >
        {member.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-neutral-700 font-medium truncate">{member.name}</span>
          {member.role_label && (
            <span className="text-xs text-neutral-400 capitalize">{member.role_label}</span>
          )}
        </div>
        {member.member_type === 'guest' && member.typical_involvement && (
          <div className="text-xs text-neutral-400 mt-0.5 truncate">
            {member.typical_involvement}
          </div>
        )}
      </div>
      {isMainUser ? (
        <span className="text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded shrink-0">You</span>
      ) : onDelete ? (
        <button onClick={onDelete} className="text-neutral-400 hover:text-red-500 text-sm shrink-0">
          Remove
        </button>
      ) : null}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────
export function HouseholdSetup({
  household,
  members,
  onUpdateHousehold,
  onAddMember,
  onUpdateMember: _onUpdateMember,
  onDeleteMember,
  onContinue,
}: HouseholdSetupProps) {
  void _onUpdateMember // Reserved for inline editing

  const [householdName, setHouseholdName] = useState(household?.name || '')
  const [address, setAddress] = useState(household?.address || '')
  const [addingType, setAddingType] = useState<MemberType | null>(null)
  const [savingHousehold, setSavingHousehold] = useState(false)

  const mainUser = members.find((m) => m.is_full_user)
  const coreMembers = members.filter((m) => !m.is_full_user && m.member_type === 'core')
  const guestMembers = members.filter((m) => m.member_type === 'guest')

  const handleSaveHousehold = useCallback(async () => {
    if (!household) return
    const updates: Partial<Household> = {}
    if (householdName.trim() && householdName !== household.name) {
      updates.name = householdName.trim()
    }
    if (address !== (household.address || '')) {
      updates.address = address.trim() || null
    }
    if (Object.keys(updates).length > 0) {
      setSavingHousehold(true)
      try {
        await onUpdateHousehold(updates)
      } finally {
        setSavingHousehold(false)
      }
    }
  }, [household, householdName, address, onUpdateHousehold])

  const handleAddMember = useCallback(
    async (
      type: MemberType,
      data: {
        name: string
        color: string
        role_label: string
        age_range?: AgeRange
        typical_involvement?: string
      },
    ) => {
      await onAddMember({
        name: data.name,
        initials: generateInitials(data.name),
        color: data.color,
        is_full_user: false,
        display_order: members.length,
        avatar_url: null,
        member_type: type,
        role_label: data.role_label,
        age_range: data.age_range,
        typical_involvement: data.typical_involvement || null,
      })
      setAddingType(null)
    },
    [onAddMember, members.length],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const member = members.find((m) => m.id === id)
      if (member?.is_full_user) return
      await onDeleteMember(id)
    },
    [members, onDeleteMember],
  )

  const handleContinue = useCallback(async () => {
    await handleSaveHousehold()
    onContinue()
  }, [handleSaveHousehold, onContinue])

  // Validation: need at least one core member beyond the main user
  const hasEnoughMembers = members.length >= 2

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-2">
          Define your household
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-10">
          The cast of characters in your family's story.
        </p>

        {/* ── Household Info ── */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3">
            Household
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Household name</label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                onBlur={handleSaveHousehold}
                placeholder="e.g. The Kaufmans"
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-600 mb-1">Home address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={handleSaveHousehold}
                placeholder="123 Main St, City, State"
                className="input-base w-full"
              />
              <p className="text-xs text-neutral-400 mt-1">
                Used for commute times and local context in your daily script.
              </p>
            </div>
          </div>
        </section>

        {/* ── Core Members ── */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3">
            Who lives here
          </h2>

          <div className="space-y-2 mb-3">
            {/* Main user always first */}
            {mainUser && <MemberCard member={mainUser} isMainUser />}

            {/* Other core members */}
            {coreMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onDelete={() => handleDelete(member.id)}
              />
            ))}
          </div>

          {addingType === 'core' ? (
            <AddMemberForm
              type="core"
              onAdd={(data) => handleAddMember('core', data)}
              onCancel={() => setAddingType(null)}
            />
          ) : (
            <button
              onClick={() => setAddingType('core')}
              className="w-full p-3 border-2 border-dashed border-neutral-200 rounded-lg text-neutral-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              + Add household member
            </button>
          )}
        </section>

        {/* ── Guest Members ── */}
        <section className="mb-10">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-1">
            Regular visitors
          </h2>
          <p className="text-sm text-neutral-400 mb-3">
            Grandparents, babysitters, and other recurring people in your family's life.
            They're not app users — they're context for your daily script.
          </p>

          {guestMembers.length > 0 && (
            <div className="space-y-2 mb-3">
              {guestMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onDelete={() => handleDelete(member.id)}
                />
              ))}
            </div>
          )}

          {addingType === 'guest' ? (
            <AddMemberForm
              type="guest"
              onAdd={(data) => handleAddMember('guest', data)}
              onCancel={() => setAddingType(null)}
            />
          ) : (
            <button
              onClick={() => setAddingType('guest')}
              className="w-full p-3 border-2 border-dashed border-neutral-200 rounded-lg text-neutral-500 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              + Add regular visitor
            </button>
          )}
        </section>

        {/* ── CTA ── */}
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!hasEnoughMembers || savingHousehold}
            className="btn-primary px-8 py-3 text-lg font-medium disabled:opacity-50"
          >
            {savingHousehold ? 'Saving...' : 'Continue'}
          </button>
          {!hasEnoughMembers && (
            <p className="text-xs text-neutral-400 mt-2 text-center absolute mt-14">
              Add at least one family member to continue
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
