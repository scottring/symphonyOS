// src/shell/PhonePaneSwitch.tsx
//
// The phone's Details | AI switch — the same two panes the desktop column
// holds (SideColumn.tsx), each full screen on a phone. Details stays mounted
// under the AI overlay, so switching back keeps the item and any edit, and the
// conversation survives because the overlay's assistant lives in the shell.

import type { SidePane } from './SideColumn';

export function PhonePaneSwitch({ active, onChange }: { active: SidePane; onChange: (pane: SidePane) => void }) {
  return (
    <div className="phone-pane-switch" data-panel-keepalive>
      <div role="tablist" aria-label="Side panel" className="side-column-switch">
        <button type="button" role="tab" aria-selected={active === 'details'} onClick={() => onChange('details')}>
          Details
        </button>
        <button type="button" role="tab" aria-selected={active === 'ai'} onClick={() => onChange('ai')}>
          AI
        </button>
      </div>
    </div>
  );
}
