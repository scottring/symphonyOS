import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { EmptyState } from '@/components/layout/EmptyState'
import { matchesLogin } from '@/lib/logins/passwordHint'
import type { Login, LoginInput } from '@/hooks/useLogins'
import { LoginRow } from './LoginRow'
import { LoginForm } from './LoginForm'

export interface LoginsViewProps {
  logins: Login[]
  loading: boolean
  error: string | null
  onAdd: (input: LoginInput) => Promise<boolean>
  onUpdate: (id: string, input: LoginInput) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}

/** Logins: a searchable list of where you sign in, the username, and a
 *  password hint. Private to you. Passwords themselves stay in Apple Passwords. */
export function LoginsView({ logins, loading, error, onAdd, onUpdate, onDelete }: LoginsViewProps) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const shown = useMemo(() => logins.filter((l) => matchesLogin(l, query)), [logins, query])

  function startAdd() {
    setEditingId(null)
    setAdding(true)
  }

  return (
    <div className={PAGE_COLUMN}>
      <MastheadCard
        variant="page"
        title="Logins"
        motif="documents"
        subline="Where you sign in, and with what. Private to you. Passwords stay in Apple Passwords."
        footer={
          <button onClick={startAdd} aria-label="Add a login"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] text-primary-700 hover:bg-primary-50">
            <Plus className="w-4 h-4" />
            Add
          </button>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
          placeholder="Find a login: site, username, notes"
          aria-label="Find a login"
          // Ready to type on a computer; on a phone the keyboard would cover the list.
          autoFocus={typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches}
          autoComplete="off"
          data-1p-ignore
          className="w-full rounded-xl border border-neutral-200 bg-bg-elevated py-2.5 pl-9 pr-9 text-[16px] focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-danger-600">{error}</div>}

      {adding && (
        <LoginForm
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            const ok = await onAdd(input)
            if (ok) { setAdding(false); setQuery('') }
            return ok
          }}
        />
      )}

      {loading ? (
        <p className="py-4 text-[14px] text-neutral-400">Loading…</p>
      ) : logins.length === 0 ? (
        !adding && (
          <EmptyState
            title="No logins yet"
            action={<button onClick={startAdd} className="text-[14px] text-primary-700 hover:underline">Add the first one</button>}
          >
            Keep the site, the username and a hint like T*********01, so you never hunt for them again.
          </EmptyState>
        )
      ) : shown.length === 0 ? (
        <EmptyState
          title={`Nothing matches “${query.trim()}”`}
          action={<button onClick={startAdd} className="text-[14px] text-primary-700 hover:underline">Add it</button>}
        />
      ) : (
        <section aria-label="Logins">
          {shown.map((l) =>
            editingId === l.id ? (
              <LoginForm
                key={l.id}
                login={l}
                onCancel={() => setEditingId(null)}
                onSave={async (input) => {
                  const ok = await onUpdate(l.id, input)
                  if (ok) setEditingId(null)
                  return ok
                }}
              />
            ) : (
              <LoginRow
                key={l.id}
                login={l}
                onEdit={() => { setAdding(false); setEditingId(l.id) }}
                onDelete={() => void onDelete(l.id)}
              />
            ),
          )}
        </section>
      )}
    </div>
  )
}
