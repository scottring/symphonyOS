// src/lib/currentAccount.ts
//
// Who is signed in, for module-level caches that are not components.
//
// `useAuth` is a hook that opens its own Supabase auth subscription, so a
// module cache cannot ask it — and a cache that calls it once per consumer
// would open one subscription per open menu. The shell already knows, once;
// it tells this, and anything holding data per-account keys on it.
//
// Why a cache needs it at all: two accounts in one tab. Sign out, sign in as
// somebody else, and a cache filled for the first is still there. It must not
// be shown to the second (Codex, 2026-09-25).

let account: string | null = null
const listeners = new Set<(id: string | null) => void>()

/** Told by the shell whenever the signed-in user changes. */
export function setCurrentAccount(id: string | null): void {
  if (account === id) return
  account = id
  for (const l of [...listeners]) l(id)
}

export function getCurrentAccount(): string | null {
  return account
}

/** Subscribe to account changes. Returns cleanup. */
export function onAccountChanged(cb: (id: string | null) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Test-only. */
export function __resetCurrentAccount(): void {
  account = null
  listeners.clear()
}
