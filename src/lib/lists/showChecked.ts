// Whether a list shows its checked items, remembered per list on this device
// (Scott, 2026-10-08: "hide checked items (as opposed to clearing them)").
// Hidden is the default. Storage can be missing or throw; then it's hidden.

const key = (listId: string) => `symphony-list-show-checked:${listId}`

export function readShowChecked(listId: string): boolean {
  try { return localStorage.getItem(key(listId)) === '1' } catch { return false }
}

export function writeShowChecked(listId: string, show: boolean): void {
  try {
    if (show) localStorage.setItem(key(listId), '1')
    else localStorage.removeItem(key(listId))
  } catch { /* a convenience; nothing to do */ }
}
