import { useState } from 'react'
import { useHousehold } from '@/hooks/useHousehold'

export function HouseholdSettings() {
  const {
    household,
    members,
    invitations,
    loading,
    isOwner,
    isAdmin,
    updateHousehold,
    inviteMember,
    cancelInvitation,
    removeMember,
    updateMemberRole,
  } = useHousehold()

  const [isEditing, setIsEditing] = useState(false)
  const [householdName, setHouseholdName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-neutral-200 rounded w-1/3" />
        <div className="h-20 bg-neutral-100 rounded" />
      </div>
    )
  }

  if (!household) {
    return (
      <div className="text-neutral-500 text-sm">
        No household found. Please refresh the page.
      </div>
    )
  }

  const handleSaveHouseholdName = async () => {
    if (!householdName.trim()) return
    try {
      await updateHousehold({ name: householdName.trim() })
      setIsEditing(false)
    } catch {
      // Error handling
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || isInviting) return

    setIsInviting(true)
    setInviteError(null)

    try {
      const invitation = await inviteMember(inviteEmail.trim())
      setLastInviteToken(invitation.token)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setIsInviting(false)
    }
  }

  const copyInviteLink = () => {
    if (!lastInviteToken) return
    const link = `${window.location.origin}/join?token=${lastInviteToken}`
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const activeMembers = members.filter(m => m.status === 'active')

  return (
    <div className="space-y-6">
      {/* Household Name */}
      <div>
        <label className="block text-sm text-neutral-500 mb-2">Household Name</label>
        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="input-base flex-1"
              placeholder="My Household"
              autoFocus
            />
            <button
              onClick={() => setIsEditing(false)}
              className="btn-secondary px-3"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveHouseholdName}
              disabled={!householdName.trim()}
              className="btn-primary px-4 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-neutral-800 font-medium">{household.name}</span>
            {isOwner && (
              <button
                onClick={() => {
                  setHouseholdName(household.name)
                  setIsEditing(true)
                }}
                className="text-neutral-400 hover:text-neutral-600 p-1"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Household Members */}
      <div>
        <label className="block text-sm text-neutral-500 mb-2">
          Household Members ({activeMembers.length})
        </label>
        <div className="space-y-2">
          {activeMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-100"
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-medium">
                {member.user_email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">
                  {member.user_email || 'Unknown'}
                </p>
                <p className="text-xs text-neutral-500 capitalize">{member.role}</p>
              </div>
              {member.role === 'owner' && (
                <span className="text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded">
                  Owner
                </span>
              )}
              {isOwner && member.role !== 'owner' && (
                <div className="flex items-center gap-1">
                  <select
                    value={member.role}
                    onChange={(e) => updateMemberRole(member.id, e.target.value as 'admin' | 'member')}
                    className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="text-neutral-400 hover:text-red-500 p-1"
                    title="Remove member"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invite Members */}
      {isAdmin && (
        <div>
          <label className="block text-sm text-neutral-500 mb-2">Invite a Family Member</label>
          <p className="text-xs text-neutral-400 mb-3">
            Invite someone to share tasks, routines, and lists with you.
          </p>

          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="input-base flex-1"
            />
            <button
              type="submit"
              disabled={!inviteEmail.trim() || isInviting}
              className="btn-primary px-4 disabled:opacity-50"
            >
              {isInviting ? 'Sending...' : 'Invite'}
            </button>
          </form>

          {inviteError && (
            <p className="text-red-500 text-sm mt-2">{inviteError}</p>
          )}

          {lastInviteToken && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-green-800 mb-2">
                Invitation created! Share this link:
              </p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-white p-2 rounded border truncate">
                  {window.location.origin}/join?token={lastInviteToken}
                </code>
                <button
                  onClick={copyInviteLink}
                  className="btn-secondary px-3 text-sm"
                >
                  {copiedLink ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Invitations */}
      {isAdmin && invitations.length > 0 && (
        <div>
          <label className="block text-sm text-neutral-500 mb-2">Pending Invitations</label>
          <div className="space-y-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200"
              >
                <div className="flex-1">
                  <p className="text-sm text-neutral-700">{invitation.email}</p>
                  <p className="text-xs text-neutral-400">
                    Expires {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => cancelInvitation(invitation.id)}
                  className="text-neutral-400 hover:text-red-500 text-sm"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
