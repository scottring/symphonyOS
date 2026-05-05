// src/shell/DetailPanel.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailPanel } from './DetailPanel';
import { SelectionProvider } from './providers/SelectionProvider';
import { createRegistry } from './appRegistry';
import type { AppDef } from './types';

const TaskPanel = ({ selection }: { selection: { kind: string; id: string } }) => (
  <div data-testid="task-panel">task panel for {selection.id}</div>
);

const ApplicationPanel = ({ selection }: { selection: { kind: string; id: string } }) => (
  <div data-testid="app-panel">app panel for {selection.id}</div>
);

const tasks: AppDef = {
  id: 'tasks',
  route: '/today',
  Component: () => null,
  DetailPanelComponent: TaskPanel,
  ownsSelectionKinds: ['task'],
};
const jobs: AppDef = {
  id: 'jobs',
  route: '/jobs',
  Component: () => null,
  DetailPanelComponent: ApplicationPanel,
  ownsSelectionKinds: ['application'],
};
const registry = createRegistry([tasks, jobs]);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SelectionProvider registry={registry}>
        <DetailPanel registry={registry} />
      </SelectionProvider>
    </MemoryRouter>,
  );
}

describe('DetailPanel', () => {
  it('renders nothing when there is no selection', () => {
    renderAt('/today');
    expect(screen.queryByTestId('task-panel')).toBeNull();
    expect(screen.queryByTestId('app-panel')).toBeNull();
  });

  it('renders the owning app panel for the active selection kind', () => {
    renderAt('/today?detail=task:abc');
    expect(screen.getByTestId('task-panel').textContent).toBe('task panel for abc');
  });

  it('renders nothing for an unowned selection kind', () => {
    renderAt('/today?detail=unknown:xyz');
    expect(screen.queryByTestId('task-panel')).toBeNull();
    expect(screen.queryByTestId('app-panel')).toBeNull();
  });

  it('renders the application panel on /jobs', () => {
    renderAt('/jobs?detail=application:new-balance');
    expect(screen.getByTestId('app-panel').textContent).toBe('app panel for new-balance');
  });
});
