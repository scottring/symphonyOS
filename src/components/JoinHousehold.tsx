import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuthUser } from '@/lib/supabase'
import { useHouseholdInvitations } from '@/hooks/useHouseholdInvitations'
import type { HouseholdInvitation, InvitationPreview } from '@/hooks/useHouseholdInvitations'

export function JoinHousehold() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { acceptInvitation, getInvitationByToken, getInvitationPreview } = useHouseholdInvitations()

  const [invitation, setInvitation] = useState<HouseholdInvitation | null>(null)
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'joining' | 'success' | 'error' | 'auth-required'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  // undefined = no choice made yet (Join disabled while candidates exist);
  // null = "I'm someone new"; a string = the chosen family_members id.
  const [chosenId, setChosenId] = useState<string | null | undefined>(undefined)

  // Check auth and fetch invitation
  useEffect(() => {
    async function init() {
      if (!token) {
        setStatus('error')
        setErrorMessage('No invitation token provided')
        return
      }

      // Check if user is logged in
      const { data: { user: authUser } } = await getAuthUser()
      setUser(authUser)

      // Fetch invitation details
      const inv = await getInvitationByToken(token)
      if (!inv) {
        setStatus('error')
        setErrorMessage('This invitation is invalid or has expired')
        return
      }

      // Check if expired
      if (new Date(inv.expires_at) < new Date()) {
        setStatus('error')
        setErrorMessage('This invitation has expired')
        return
      }

      setInvitation(inv)
      // Best-effort — the invitee whose name==email guess is enough gets no
      // chooser, and this must never block the join flow if it fails.
      void getInvitationPreview(token).then(setPreview)

      if (!authUser) {
        setStatus('auth-required')
      } else {
        setStatus('ready')
      }
    }
    init()
  }, [token, getInvitationByToken, getInvitationPreview])

  const needsChoice = !!preview && preview.candidates.length > 0 && chosenId === undefined

  const handleJoin = useCallback(async () => {
    if (!token || needsChoice) return
    setStatus('joining')

    try {
      await acceptInvitation(token, chosenId ?? null)
      setStatus('success')
      // Redirect to home after brief delay
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to join household')
    }
  }, [token, needsChoice, acceptInvitation, chosenId, navigate])

  const handleSignIn = useCallback(() => {
    // Store the join token so we can redirect back after auth
    sessionStorage.setItem('symphony-join-token', token || '')
    navigate('/')
  }, [token, navigate])

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-semibold text-neutral-800">Symphony</h1>
          <p className="text-neutral-500 mt-1">Family life, orchestrated</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-150 shadow-sm p-8">
          {status === 'loading' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Loading invitation...</p>
            </div>
          )}

          {status === 'auth-required' && invitation && (
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-semibold text-neutral-800 mb-2">
                You're invited to join a household
              </h2>
              <p className="text-sm text-neutral-500 mb-6">
                Sign in or create an account to join this family's Symphony.
              </p>
              <button
                onClick={handleSignIn}
                className="btn-primary w-full"
              >
                Sign in to continue
              </button>
            </div>
          )}

          {status === 'ready' && invitation && (
            <div className="text-center">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-semibold text-neutral-800 mb-2">
                {preview ? `${preview.inviter_name} invited you to the ${preview.household_name}` : 'Join this household'}
              </h2>
              <p className="text-sm text-neutral-500 mb-2">
                Signed in as <span className="font-medium text-neutral-700">{user?.email}</span>
              </p>
              {preview && preview.candidates.length > 0 && (
                <fieldset className="mb-4 text-left">
                  <legend className="text-sm font-medium text-neutral-700 mb-2">Which one is you?</legend>
                  <div className="flex flex-wrap gap-2">
                    {preview.candidates.map((c) => (
                      <label
                        key={c.id}
                        className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          chosenId === c.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="join-as"
                          value={c.id}
                          checked={chosenId === c.id}
                          onChange={() => setChosenId(c.id)}
                          className="sr-only"
                        />
                        {c.name}
                      </label>
                    ))}
                    <label
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        chosenId === null ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="join-as"
                        value="new"
                        checked={chosenId === null}
                        onChange={() => setChosenId(null)}
                        className="sr-only"
                      />
                      I'm someone new
                    </label>
                  </div>
                </fieldset>
              )}
              <p className="text-sm text-neutral-500 mb-6">
                You'll be able to see shared family tasks, events, and routines.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoin}
                  disabled={needsChoice}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join household
                </button>
              </div>
            </div>
          )}

          {status === 'joining' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Joining household...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-semibold text-neutral-800 mb-2">
                Welcome to the family!
              </h2>
              <p className="text-sm text-neutral-500">
                Redirecting to your new shared dashboard...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-semibold text-neutral-800 mb-2">
                Something went wrong
              </h2>
              <p className="text-sm text-neutral-500 mb-6">{errorMessage}</p>
              <button
                onClick={() => navigate('/')}
                className="btn-primary w-full"
              >
                Go to Symphony
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
