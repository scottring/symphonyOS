// src/components/schedule/TodayListsLine.tsx
//
// The quiet Lists line at the foot of Today (Scott, 2026-11-13): the lists
// you use every day or two — Groceries 12 · Sundries 4 · Amazon 3 — one tap
// away instead of under More. A list joins with its "Show on Today" switch;
// nothing shows when none has it. Tapping one opens the list in a sheet
// beside the page, so you never leave Today.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useOptionalListsContext, type ListsContextValue } from '@/contexts/ListsContext'
import { useOpenListCounts } from '@/hooks/useOpenListCounts'
import { KindIcon } from './KindIcon'

/** Checked rows kept under the open ones in the sheet. */
const RECENT_DONE = 10

const ListView = lazy(() => import('@/components/list/ListView').then((m) => ({ default: m.ListView })))

export function TodayListsLine() {
  const ctx = useOptionalListsContext()
  return ctx ? <ListsLine ctx={ctx} /> : null
}

function ListsLine({ ctx }: { ctx: ListsContextValue }) {
  const shown = useMemo(() => ctx.lists.filter((l) => l.showOnToday), [ctx.lists])
  const { counts, refresh } = useOpenListCounts(shown.map((l) => l.id))
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? shown.find((l) => l.id === openId) ?? null : null

  // The sheet drives the shared list selection while it is open.
  const { setSelectedListId } = ctx
  useEffect(() => {
    setSelectedListId(openId)
  }, [openId, setSelectedListId])
  const close = () => { setOpenId(null); refresh() }
  // What you still need first; only the last few ticked off after them (a
  // grocery list holds hundreds of checked rows).
  const sheetItems = useMemo(() => {
    const open = ctx.listItems.filter((i) => !i.completed)
    const done = ctx.listItems.filter((i) => i.completed)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)).slice(0, RECENT_DONE)
    return [...open, ...done]
  }, [ctx.listItems])

  if (!shown.length) return null
  return (
    <>
      <nav className="today-lists-line" aria-label="Lists">
        <span className="today-lists-label">Lists</span>
        {shown.map((list) => (
          <button key={list.id} type="button" className={`today-list-chip${openId === list.id ? ' is-open' : ''}`}
            onClick={() => setOpenId(openId === list.id ? null : list.id)}>
            <span className="today-list-icon" aria-hidden="true"><KindIcon title={list.title} size={16} /></span>
            <span className="today-list-name">{list.title}</span>
            {counts.has(list.id) && <span className="today-list-count">{counts.get(list.id)}</span>}
          </button>
        ))}
      </nav>
      {open && ctx.selectedList?.id === open.id && (
        <div className="today-list-sheet" role="dialog" aria-label={open.title}>
          <button type="button" className="today-list-sheet-close" aria-label={`Close ${open.title}`} onClick={close}><X size={18} /></button>
          <Suspense fallback={null}>
            <ListView
              list={open}
              items={sheetItems}
              onBack={close}
              onUpdateList={ctx.updateList}
              onAddItem={ctx.addItem}
              onUpdateItem={ctx.updateItem}
              onDeleteItem={ctx.deleteItem}
              onClearCompleted={ctx.clearCompleted}
              onReorderItems={ctx.reorderItems}
            />
          </Suspense>
        </div>
      )}
    </>
  )
}
