// src/hooks/useScratchpadHidden.ts
//
// Shared hidden-state hook for the scratchpad. Backed by localStorage so the
// preference survives page reloads. All consumers (ScratchpadPane, AppShell,
// Shell) stay in sync via a custom window event + the native 'storage' event
// (cross-tab), without prop-drilling.

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'symphony-scratchpad-hidden';
const SYNC_EVENT = 'symphony:scratchpad-hidden-changed';

// Default is HIDDEN (collapsed). The assistant rail must not auto-open on page
// load and cover the main column — the user opens it deliberately, and that
// preference (an explicit '0') persists. Any other value (incl. absent) = hidden.
function readHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function useScratchpadHidden(): {
  hidden: boolean;
  setHidden: (v: boolean) => void;
} {
  const [hidden, setHiddenState] = useState<boolean>(readHidden);

  // Sync from storage/event (cross-consumer + cross-tab)
  useEffect(() => {
    const sync = () => setHiddenState(readHidden());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setHidden = useCallback((v: boolean) => {
    try {
      if (v) {
        // Hidden is the default — clear the explicit "open" marker.
        localStorage.removeItem(STORAGE_KEY);
      } else {
        // Persist that the user deliberately opened the rail.
        localStorage.setItem(STORAGE_KEY, '0');
      }
    } catch {
      // Ignore storage errors (private browsing, quota exceeded)
    }
    setHiddenState(v);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  return { hidden, setHidden };
}
