// src/hooks/useScratchpadHidden.ts
//
// Shared hidden-state hook for the scratchpad. Backed by localStorage so the
// preference survives page reloads. All consumers (ScratchpadPane, AppShell,
// Shell) stay in sync via a custom window event + the native 'storage' event
// (cross-tab), without prop-drilling.

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'symphony-scratchpad-hidden';
const SYNC_EVENT = 'symphony:scratchpad-hidden-changed';

function readHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
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
        localStorage.setItem(STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors (private browsing, quota exceeded)
    }
    setHiddenState(v);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  return { hidden, setHidden };
}
