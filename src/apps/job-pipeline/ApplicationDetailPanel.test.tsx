// src/apps/job-pipeline/ApplicationDetailPanel.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SelectionProvider } from '@/shell/providers/SelectionProvider';
import { createRegistry } from '@/shell/appRegistry';
import { ApplicationDetailPanel } from './ApplicationDetailPanel';
import type { VaultApplication } from 'virtual:vault-applications';

vi.mock('virtual:vault-applications', () => ({
  applications: [
    {
      slug: 'test-co',
      type: 'task',
      domain: 'job-search',
      status: 'applied',
      company: 'Test Co',
      role: 'Engineer',
      comp_low: 100000,
      comp_high: 120000,
      location: 'Boston',
      remote: 'hybrid',
      applied: '2026-04-01',
      next_step: 'follow up',
      next_step_due: '2026-04-29',
      created: '2026-04-01',
      tags: [],
      linked: ['[[resume-test]]', '[[cover-letter-test]]'],
      filename: 'apply-test-co.md',
      body: '# Apply for Test Co — Engineer\n\nSome notes about the role.',
      isStalled: false,
      archived: false,
    } satisfies VaultApplication,
  ],
}));

const registry = createRegistry([
  {
    id: 'job-pipeline',
    route: '/jobs',
    Component: () => null,
    DetailPanelComponent: ApplicationDetailPanel,
    ownsSelectionKinds: ['application'],
  },
]);

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/jobs?detail=application:test-co']}>
      <SelectionProvider registry={registry}>
        <ApplicationDetailPanel selection={{ kind: 'application', id: 'test-co' }} />
      </SelectionProvider>
    </MemoryRouter>,
  );
}

describe('ApplicationDetailPanel', () => {
  it('renders the application company and role', () => {
    renderPanel();
    expect(screen.getByText(/test co/i)).toBeInTheDocument();
    expect(screen.getByText(/engineer/i)).toBeInTheDocument();
  });

  it('shows three tabs: Overview, Notes, Documents', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /notes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /documents/i })).toBeInTheDocument();
  });

  it('starts on the Overview tab and shows comp/location/applied', () => {
    renderPanel();
    expect(screen.getByText(/100k/i)).toBeInTheDocument();
    expect(screen.getByText(/Boston/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-01/)).toBeInTheDocument();
  });

  it('switches to the Notes tab and renders the body', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: /notes/i }));
    expect(screen.getByText(/some notes about the role/i)).toBeInTheDocument();
  });

  it('shows resolved wikilinks in the Documents tab', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: /documents/i }));
    expect(screen.getByText(/resume-test/i)).toBeInTheDocument();
    expect(screen.getByText(/cover-letter-test/i)).toBeInTheDocument();
  });

  it('exposes an Edit in Obsidian link with the correct URL', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: /edit in obsidian/i }) as HTMLAnchorElement;
    expect(link.href).toBe('obsidian://open?vault=scotts-world&file=tasks%2Fapply-test-co.md');
  });
});
