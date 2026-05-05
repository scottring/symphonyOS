// src/shell/providers/SelectionProvider.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SelectionProvider, useSelection } from './SelectionProvider';
import { createRegistry } from '../appRegistry';
import type { AppDef } from '../types';

const fakeApp = (id: string, route: string, kinds: string[] = []): AppDef => ({
  id,
  route,
  Component: () => null,
  ownsSelectionKinds: kinds,
});

const registry = createRegistry([
  fakeApp('tasks', '/today', ['task']),
  fakeApp('jobs', '/jobs', ['application']),
]);

function Probe() {
  const { selection, setSelection, clearSelection } = useSelection();
  const location = useLocation();
  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
      <div data-testid="selection">
        {selection ? `${selection.kind}:${selection.id}` : 'none'}
      </div>
      <button onClick={() => setSelection({ kind: 'task', id: 'abc' })}>
        select-task
      </button>
      <button onClick={() => clearSelection()}>clear</button>
    </div>
  );
}

function renderWithRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <SelectionProvider registry={registry}>
        <Routes>
          <Route path="/today/*" element={<Probe />} />
          <Route path="/jobs/*" element={<Probe />} />
        </Routes>
      </SelectionProvider>
    </MemoryRouter>,
  );
}

describe('SelectionProvider', () => {
  it('parses ?detail=task:abc into selection state', () => {
    renderWithRoutes('/today?detail=task:abc');
    expect(screen.getByTestId('selection').textContent).toBe('task:abc');
  });

  it('reports no selection when ?detail is absent', () => {
    renderWithRoutes('/today');
    expect(screen.getByTestId('selection').textContent).toBe('none');
  });

  it('setSelection updates the URL search params', () => {
    renderWithRoutes('/today');
    act(() => {
      screen.getByText('select-task').click();
    });
    // URLSearchParams.toString() encodes ':' as '%3A'. The selection still parses correctly
    // because searchParams.get() decodes on read.
    expect(screen.getByTestId('search').textContent).toBe('?detail=task%3Aabc');
    expect(screen.getByTestId('selection').textContent).toBe('task:abc');
  });

  it('clearSelection removes ?detail from the URL', () => {
    renderWithRoutes('/today?detail=task:abc');
    act(() => {
      screen.getByText('clear').click();
    });
    expect(screen.getByTestId('search').textContent).toBe('');
    expect(screen.getByTestId('selection').textContent).toBe('none');
  });

  it('strips ?detail when navigating to an app that does not own the kind', () => {
    // Use `key` on MemoryRouter to force unmount/remount on rerender so the new
    // initialEntries actually take effect (MemoryRouter ignores prop changes after mount).
    const { rerender } = render(
      <MemoryRouter key="/today" initialEntries={['/today?detail=task:abc']}>
        <SelectionProvider registry={registry}>
          <Routes>
            <Route path="/today/*" element={<Probe />} />
            <Route path="/jobs/*" element={<Probe />} />
          </Routes>
        </SelectionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('selection').textContent).toBe('task:abc');

    rerender(
      <MemoryRouter key="/jobs" initialEntries={['/jobs?detail=task:abc']}>
        <SelectionProvider registry={registry}>
          <Routes>
            <Route path="/today/*" element={<Probe />} />
            <Route path="/jobs/*" element={<Probe />} />
          </Routes>
        </SelectionProvider>
      </MemoryRouter>,
    );
    // After SelectionProvider's effect runs, ?detail should be cleared
    // because the new path /jobs is owned by 'jobs' app, which owns 'application' not 'task'.
    expect(screen.getByTestId('selection').textContent).toBe('none');
  });
});
