// src/shell/providers/SelectionProvider.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { SelectionRef } from '../types';
import type { AppRegistry } from '../appRegistry';
import { resolveAppForSelection } from '../appRegistry';

interface SelectionContextValue {
  selection: SelectionRef | null;
  setSelection: (ref: SelectionRef) => void;
  clearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

function parseSelection(raw: string | null): SelectionRef | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx <= 0 || idx === raw.length - 1) return null;
  return { kind: raw.slice(0, idx), id: raw.slice(idx + 1) };
}

function findAppForPath(
  registry: AppRegistry,
  pathname: string,
) {
  // Match app whose `route` is a prefix of pathname (handles /today/inbox under /today)
  return registry.find((app) => {
    if (app.route === '/' || app.route === '') return pathname === '/';
    return pathname === app.route || pathname.startsWith(`${app.route}/`);
  });
}

interface ProviderProps {
  registry: AppRegistry;
  children: ReactNode;
}

export function SelectionProvider({ registry, children }: ProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const selection = useMemo(
    () => parseSelection(searchParams.get('detail')),
    [searchParams],
  );

  const setSelection = useCallback(
    (ref: SelectionRef) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('detail', `${ref.kind}:${ref.id}`);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const clearSelection = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('detail');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // Strip ?detail when navigating into an app that doesn't own the kind.
  useEffect(() => {
    if (!selection) return;
    const activeApp = findAppForPath(registry, location.pathname);
    const owningApp = resolveAppForSelection(registry, selection.kind);
    if (!activeApp || !owningApp || activeApp.id !== owningApp.id) {
      clearSelection();
    }
  }, [selection, location.pathname, registry, clearSelection]);

  const value = useMemo<SelectionContextValue>(
    () => ({ selection, setSelection, clearSelection }),
    [selection, setSelection, clearSelection],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error('useSelection must be used inside <SelectionProvider>');
  }
  return ctx;
}
