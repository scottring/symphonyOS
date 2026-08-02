// src/components/wall-v2/WallV2PinnedListCard.tsx
//
// One pinned list on the wall face: title, open count, up to five open items
// you can check off in place, and an overflow line into the full sheet.
// Purely presentational — WallV2PinnedList owns the data and mutations.

import { ClipboardList } from 'lucide-react';
import { WALL } from './wallTheme';
import type { ListItem } from '@/types/list';

/** Five rows is what the right column can spare next to the other cards. */
const MAX_ROWS = 5;

interface Props {
  title: string;
  openItems: ListItem[];
  /** True while the container's initial fetch is still in flight. */
  loading: boolean;
  onToggle: (id: string) => void;
  onOpen: () => void;
}

export function WallV2PinnedListCard({ title, openItems, loading, onToggle, onOpen }: Props) {
  const rows = openItems.slice(0, MAX_ROWS);
  const overflow = openItems.length - rows.length;
  // useListItems starts with items:[] and loading:true, so without this guard
  // every reload briefly renders "Nothing on this list" for a genuinely
  // populated list. Only show the empty state once loading has resolved.
  const stillLoading = loading && openItems.length === 0;

  return (
    <div className={`${WALL.card} p-3`}>
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="w-full flex items-center gap-2 mb-2 text-left"
      >
        <ClipboardList className={`w-4 h-4 shrink-0 ${WALL.muted}`} />
        <span className={`font-display text-[1.05rem] truncate ${WALL.inkStrong}`}>{title}</span>
        <span className={`ml-auto ${WALL.label}`}>{openItems.length}</span>
      </button>

      {rows.length === 0 ? (
        stillLoading ? null : (
          <div className={`text-[0.85rem] ${WALL.muted}`}>Nothing on this list</div>
        )
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`Check off ${item.text}`}
                onClick={() => onToggle(item.id)}
                className={`${WALL.cardInset} w-full flex items-center gap-2.5 px-2.5 h-11 text-left active:scale-[0.99] transition-transform`}
              >
                <span
                  aria-hidden
                  className="w-5 h-5 shrink-0 rounded-md border-2 border-[#C9BDA3] dark:border-[#5A4E3B]"
                />
                <span className={`text-[0.9rem] truncate ${WALL.ink}`}>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {overflow > 0 && (
        <button type="button" onClick={onOpen} className={`mt-1.5 text-[0.8rem] ${WALL.muted}`}>
          +{overflow} more
        </button>
      )}
    </div>
  );
}
