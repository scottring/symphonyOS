import { useState } from 'react'
import { KeyRound, Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { showToast } from '@/hooks/useToast'
import { displayHost, openableUrl } from '@/lib/logins/passwordHint'
import { LIST_ROW, LIST_ROW_LANE, LIST_ROW_BODY, LIST_ROW_TITLE } from '@/components/layout/listRow'
import type { Login } from '@/hooks/useLogins'

const iconBtn = 'p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast(`${what} copied`, 'success')
  } catch {
    showToast(`Couldn't copy the ${what.toLowerCase()}.`, 'error')
  }
}

export function LoginRow({ login, onEdit, onDelete }: {
  login: Login
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const host = displayHost(login.url)
  const href = openableUrl(login.url)

  return (
    <div className={LIST_ROW}>
      <span className={LIST_ROW_LANE}>
        <KeyRound className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
      </span>
      <div className={LIST_ROW_BODY}>
        <button type="button" onClick={onEdit} className={`${LIST_ROW_TITLE} text-left hover:underline`}>
          {login.site}
        </button>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] leading-snug text-neutral-600">
          {login.username ? (
            <span className="min-w-0 truncate select-all">{login.username}</span>
          ) : (
            <span className="text-neutral-400">No username</span>
          )}
          {login.passwordHint && (
              <span className="font-mono text-neutral-700" aria-label={`Password hint ${login.passwordHint}`}>
                {login.passwordHint}
              </span>
          )}
          {host && (
            <span className="truncate text-neutral-400">{host}</span>
          )}
        </div>
        {login.notes && <div className="mt-0.5 truncate text-[12px] text-neutral-500">{login.notes}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {login.username && (
          <button onClick={() => void copy(login.username!, 'Username')} aria-label={`Copy ${login.site} username`}
            title="Copy username" className={iconBtn}>
            <Copy className="w-4 h-4" />
          </button>
        )}
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${login.site}`}
            title="Open the site — Safari fills the password from Apple Passwords" className={iconBtn}>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button onClick={onEdit} aria-label={`Edit ${login.site}`} title="Edit" className={`${iconBtn} hidden sm:inline-flex`}>
          <Pencil className="w-4 h-4" />
        </button>
        {confirmingDelete ? (
          <span role="group" aria-label="Confirm delete" className="flex items-center gap-1">
            <button onClick={() => { setConfirmingDelete(false); onDelete() }}
              className="px-2 py-1 rounded-lg text-xs font-medium text-white bg-danger-600 hover:bg-danger-500">
              Delete
            </button>
            <button onClick={() => setConfirmingDelete(false)}
              className="px-2 py-1 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100">
              Keep
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} aria-label={`Delete ${login.site}`}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-600 hover:bg-danger-50">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
