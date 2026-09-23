// src/shell/SideColumn.tsx
//
// Desktop's one right-hand column: Details or AI, never both side by side
// (Journal layout, 2026-09-23 — "Shelves left · planning center · Details or
// AI right"). Switching between them hides the other pane instead of
// unmounting it, so the selected item, any edit in progress, and the
// conversation all survive the switch.
//
// The detail panel renders through the Shell's DetailPanel as before; on
// desktop its chrome portals into this column's Details slot (see
// useSideColumnSlot in TaskDetailPanel's PanelChrome). Phones keep the
// full-screen panel and overlay, so none of this mounts there.

import { createContext, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type SidePane = 'details' | 'ai';

interface SlotValue {
  /** A SideColumn is mounted above (desktop Shell). */
  hosted: boolean;
  /** Where the detail panel draws on desktop; null on phones/tests. */
  detailsSlot: HTMLElement | null;
  /** False while the AI pane covers Details — Escape must not close it. */
  detailsVisible: boolean;
}

const SideColumnSlotContext = createContext<SlotValue>({ hosted: false, detailsSlot: null, detailsVisible: true });

export function useSideColumnSlot(): SlotValue {
  return useContext(SideColumnSlotContext);
}

export const SIDE_COLUMN_WIDTH = 420;

interface Props {
  /** A selected item exists (Details has something to show). */
  hasSelection: boolean;
  /** The AI pane is open (persisted user preference). */
  aiOpen: boolean;
  /** Which pane is in front when both are available. */
  pane: SidePane;
  onPaneChange: (pane: SidePane) => void;
  /** Close the pane in front: Details clears the selection, AI hides. */
  onCloseDetails: () => void;
  onCloseAi: () => void;
  /** The assistant pane (ChatPanel), mounted once and kept while hidden. */
  ai: ReactNode;
  /** Page content — the detail panel inside it portals into the slot. */
  children: ReactNode;
}

/** The column itself plus the slot context for the page beneath it. */
export function SideColumn({ hasSelection, aiOpen, pane, onPaneChange, onCloseDetails, onCloseAi, ai, children }: Props) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const open = hasSelection || aiOpen;
  // Nothing selected → AI is all there is; AI closed → Details is.
  const front: SidePane = !hasSelection ? 'ai' : !aiOpen ? 'details' : pane;
  const showAi = front === 'ai';

  return (
    <SideColumnSlotContext.Provider value={{ hosted: true, detailsSlot: slot, detailsVisible: open && !showAi }}>
      {children}
      {open && (
        <aside
          className="side-column"
          style={{ width: SIDE_COLUMN_WIDTH }}
          aria-label={showAi ? 'Symphony AI' : 'Details'}
          // Clicks in either pane are not "clicks away" from the detail panel.
          data-panel-keepalive
        >
          <div className="side-column-bar">
            <div role="tablist" aria-label="Side pane" className="side-column-switch">
              <button
                type="button"
                role="tab"
                aria-selected={!showAi}
                disabled={!hasSelection}
                title={hasSelection ? undefined : 'Select an item to see its details'}
                onClick={() => onPaneChange('details')}
              >
                Details
              </button>
              <button type="button" role="tab" aria-selected={showAi} onClick={() => onPaneChange('ai')}>
                AI
              </button>
            </div>
            <button
              type="button"
              className="side-column-close"
              aria-label={showAi ? 'Close AI' : 'Close details'}
              onClick={showAi ? onCloseAi : onCloseDetails}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="side-column-body">
            <div ref={setSlot} className="side-column-pane" hidden={showAi || !hasSelection} />
            {aiOpen && <div className="side-column-pane" hidden={!showAi}>{ai}</div>}
          </div>
        </aside>
      )}
    </SideColumnSlotContext.Provider>
  );
}
