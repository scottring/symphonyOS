import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { maskPassword } from '@/lib/logins/passwordHint'
import type { Login, LoginInput } from '@/hooks/useLogins'

const field =
  'w-full px-2.5 py-1.5 rounded-md text-[15px] bg-bg-elevated border border-neutral-300 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
const fieldLabel = 'block text-[11px] uppercase tracking-wide text-neutral-400 mb-1'

// Keep browsers and password managers from offering to save or fill these.
const noFill = { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' } as const

/** Add or edit one login. The password box is never saved — typing in it
 *  only writes a masked hint into the Hint field. */
export function LoginForm({ login, onSave, onCancel }: {
  login?: Login
  onSave: (input: LoginInput) => Promise<boolean>
  onCancel: () => void
}) {
  const [site, setSite] = useState(login?.site ?? '')
  const [url, setUrl] = useState(login?.url ?? '')
  const [username, setUsername] = useState(login?.username ?? '')
  const [hint, setHint] = useState(login?.passwordHint ?? '')
  const [notes, setNotes] = useState(login?.notes ?? '')
  const [masking, setMasking] = useState(false)
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const id = login?.id ?? 'new'

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!site.trim() || saving) return
    setSaving(true)
    const ok = await onSave({ site, url, username, passwordHint: hint, notes })
    setSaving(false)
    if (ok) setSecret('')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      onKeyDown={onKeyDown}
      autoComplete="off"
      className="-mx-3 mb-2 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-3"
      aria-label={login ? `Edit ${login.site}` : 'New login'}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel} htmlFor={`site-${id}`}>Site or account</label>
          <input id={`site-${id}`} className={field} value={site} autoFocus required
            placeholder="Comcast" onChange={(e) => setSite(e.target.value)} {...noFill} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor={`url-${id}`}>Web address</label>
          <input id={`url-${id}`} className={field} value={url} inputMode="url"
            placeholder="xfinity.com" onChange={(e) => setUrl(e.target.value)} {...noFill} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor={`user-${id}`}>Username or email</label>
          <input id={`user-${id}`} className={field} value={username} autoCapitalize="off" spellCheck={false}
            onChange={(e) => setUsername(e.target.value)} {...noFill} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor={`hint-${id}`}>Password hint</label>
          <input id={`hint-${id}`} className={`${field} font-mono`} value={hint} maxLength={64}
            autoCapitalize="off" spellCheck={false} placeholder="T*********01"
            onChange={(e) => setHint(e.target.value)} {...noFill} />
          {masking ? (
            <div className="mt-2">
              <label className={fieldLabel} htmlFor={`secret-${id}`}>Password (not saved)</label>
              <input id={`secret-${id}`} className={field} type="password" value={secret}
                autoComplete="new-password" data-1p-ignore data-lpignore="true"
                onChange={(e) => { setSecret(e.target.value); setHint(maskPassword(e.target.value)) }} />
              <p className="mt-1 text-[12px] text-neutral-500">
                Only the hint above is saved. Edit it to show more or fewer letters.
              </p>
            </div>
          ) : (
            <button type="button" onClick={() => setMasking(true)}
              className="mt-1 text-[12px] text-primary-700 hover:underline">
              Make a hint from the password
            </button>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabel} htmlFor={`notes-${id}`}>Notes</label>
          <input id={`notes-${id}`} className={field} value={notes}
            placeholder="Account number, security question, who uses it"
            onChange={(e) => setNotes(e.target.value)} {...noFill} />
        </div>
      </div>
      <p className="mt-2 text-[12px] text-neutral-500">
        Don't type the full password in the hint. The password itself stays in Apple Passwords.
      </p>
      <div className="flex items-center gap-2 mt-3">
        <button type="submit" disabled={!site.trim() || saving}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-[13px] text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100">
          Cancel
        </button>
      </div>
    </form>
  )
}
