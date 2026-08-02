// src/components/wall-v2/WallV2ListSheet.tsx
//
// Full-screen list editor for the kiosk. Presentational: the container owns
// the data and every mutation. Touch-first — 72px rows, no fine targets, and
// destructive actions are a two-tap inline confirm rather than a browser
// dialog (a modal dialog blocks the wall until someone dismisses it).

import { useEffect, useRef, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, MoreHorizontal, Pin, PinOff, Plus, X,
} from 'lucide-react';
import { WALL } from './wallTheme';
import type { ListItem } from '@/types/list';

export interface WallListSummary {
  id: string;
  title: string;
  openCount: number | null;
}

interface Props {
  lists: WallListSummary[];
  selectedListId: string | null;
  onSelectList: (id: string) => void;
  items: ListItem[];
  /** True while the container's initial fetch for the selected list is in flight. */
  loading: boolean;
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  onAdd: (text: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onEditText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onClearDone: () => void;
  onClose: () => void;
}

export function WallV2ListSheet({
  lists, selectedListId, onSelectList, items, loading, pinnedIds, onTogglePin,
  onAdd, onToggle, onEditText, onDelete, onClearDone, onClose,
}: Props) {
  const [draft, setDraft] = useState('');
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  // Disarm the clear confirm after a few seconds so a stray tap can't leave
  // a destructive button primed for the next person who walks up.
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  // A list switch invalidates every bit of transient UI state below: an open
  // row menu or in-progress edit can point at an item id that happens to
  // exist on the new list too, and a stray tap on a still-armed "Clear done"
  // must not fire on the wrong list. Reset it all so nothing carries across.
  useEffect(() => {
    setDraft('');
    setMenuItemId(null);
    setEditingId(null);
    setEditDraft('');
    setShowDone(false);
    setConfirmClear(false);
  }, [selectedListId]);

  const selected = lists.find((l) => l.id === selectedListId) ?? null;
  const open = items.filter((i) => !i.completed);
  const done = items.filter((i) => i.completed);
  // useListItems starts with items:[] and loading:true, so without this guard
  // every reload briefly announces the list is empty before the fetch lands.
  const stillLoading = loading && items.length === 0;

  const submitAdd = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
    addRef.current?.focus();
  };

  const startEdit = (item: ListItem) => {
    setMenuItemId(null);
    setEditingId(item.id);
    setEditDraft(item.text);
  };

  const saveEdit = () => {
    const text = editDraft.trim();
    if (editingId && text) onEditText(editingId, text);
    setEditingId(null);
  };

  return (
    <div className={`fixed inset-0 z-50 ${WALL.root} flex flex-col p-5 gap-4`}>
      <div className="flex items-center justify-between">
        <div className={WALL.label}>Lists</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`${WALL.card} grid place-items-center w-14 h-14`}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left rail — which list, and whether it lives on the wall face */}
        <div className={`${WALL.rail} rounded-2xl w-[280px] shrink-0 p-2 flex flex-col gap-2 overflow-y-auto`}>
          {lists.map((list) => {
            const isPinned = pinnedIds.includes(list.id);
            return (
              <div key={list.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Show ${list.title}`}
                  onClick={() => onSelectList(list.id)}
                  className={`${WALL.card} flex-1 min-w-0 flex items-center gap-2 px-3 h-16 text-left ${
                    list.id === selectedListId ? WALL.nowAccent : ''
                  }`}
                >
                  <span className={`flex-1 truncate text-[1.05rem] font-semibold ${WALL.inkStrong}`}>
                    {list.title}
                  </span>
                  {list.openCount !== null && (
                    <span className={WALL.label}>{list.openCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${list.title}`}
                  onClick={() => onTogglePin(list.id)}
                  className={`${WALL.card} grid place-items-center w-16 h-16 shrink-0`}
                >
                  {isPinned
                    ? <Pin className="w-5 h-5 text-[#2E4638] dark:text-[#4E7261]" />
                    : <PinOff className={`w-5 h-5 ${WALL.muted}`} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Right pane — add field, open items, done drawer */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              ref={addRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
              placeholder={selected ? `Add to ${selected.title}` : 'Add an item'}
              className={`${WALL.cardInset} flex-1 min-w-0 px-4 h-16 text-[1.15rem] ${WALL.ink} outline-none`}
            />
            <button
              type="button"
              onClick={submitAdd}
              className={`${WALL.card} flex items-center gap-2 px-6 h-16 text-[1.05rem] font-semibold ${WALL.inkStrong}`}
            >
              <Plus className="w-5 h-5" />
              Add
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
            {open.length === 0 && !stillLoading && (
              <div className={`px-1 py-3 text-[1rem] ${WALL.muted}`}>Nothing open on this list</div>
            )}

            {open.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                {editingId === item.id ? (
                  <>
                    <input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                      className={`${WALL.cardInset} flex-1 min-w-0 px-4 h-[72px] text-[1.1rem] ${WALL.ink} outline-none`}
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className={`${WALL.card} px-5 h-[72px] text-[1rem] font-semibold ${WALL.inkStrong}`}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Check off ${item.text}`}
                      onClick={() => onToggle(item.id, true)}
                      className={`${WALL.card} flex-1 min-w-0 flex items-center gap-3 px-4 h-[72px] text-left active:scale-[0.995] transition-transform`}
                    >
                      <span
                        aria-hidden
                        className="w-7 h-7 shrink-0 rounded-lg border-2 border-[#C9BDA3] dark:border-[#5A4E3B]"
                      />
                      <span className={`truncate text-[1.1rem] ${WALL.ink}`}>{item.text}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`More actions for ${item.text}`}
                      onClick={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
                      className={`${WALL.card} grid place-items-center w-[72px] h-[72px] shrink-0`}
                    >
                      <MoreHorizontal className={`w-6 h-6 ${WALL.muted}`} />
                    </button>
                  </>
                )}

                {menuItemId === item.id && editingId !== item.id && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className={`${WALL.card} px-5 h-[72px] text-[1rem] font-semibold ${WALL.inkStrong}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuItemId(null); onDelete(item.id); }}
                      className={`${WALL.card} px-5 h-[72px] text-[1rem] font-semibold ${WALL.warn}`}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}

            {done.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Collapsing the drawer must disarm an armed "Clear
                      // done" — otherwise re-expanding within the 4s timer
                      // leaves it primed and a single tap deletes every done
                      // row (not undoable, and it propagates to everyone's
                      // Apple Reminders within 60s).
                      const next = !showDone;
                      setShowDone(next);
                      if (!next) setConfirmClear(false);
                    }}
                    className={`${WALL.cardInset} flex items-center gap-2 px-4 h-14 ${WALL.muted}`}
                  >
                    {showDone ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    <span className="text-[1rem] font-semibold">Done ({done.length})</span>
                  </button>
                  {showDone && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmClear) { setConfirmClear(false); onClearDone(); }
                        else setConfirmClear(true);
                      }}
                      className={`${WALL.card} px-5 h-14 text-[1rem] font-semibold ${WALL.warn}`}
                    >
                      {confirmClear ? 'Tap again to confirm' : 'Clear done'}
                    </button>
                  )}
                </div>

                {showDone && (
                  <div className="flex flex-col gap-2 mt-2">
                    {done.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Uncheck ${item.text}`}
                        onClick={() => onToggle(item.id, false)}
                        className={`${WALL.cardInset} flex items-center gap-3 px-4 h-[72px] text-left`}
                      >
                        <Check className={`w-6 h-6 shrink-0 ${WALL.muted}`} />
                        <span className={`truncate text-[1.05rem] line-through ${WALL.muted}`}>{item.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
