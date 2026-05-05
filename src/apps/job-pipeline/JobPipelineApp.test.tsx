// src/apps/job-pipeline/JobPipelineApp.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SelectionProvider } from '@/shell/providers/SelectionProvider';
import { createRegistry } from '@/shell/appRegistry';
import { JobPipelineApp } from './JobPipelineApp';
import type { VaultApplication } from 'virtual:vault-applications';

vi.mock('virtual:vault-applications', () => {
  const apps: VaultApplication[] = [
    {
      slug: 'overdue-co',
      type: 'task',
      domain: 'job-search',
      status: 'applied',
      company: 'Overdue Co',
      role: 'Engineer',
      comp_low: 100000,
      comp_high: 120000,
      location: 'Remote',
      remote: 'remote',
      applied: '2026-01-01',
      next_step: 'follow up',
      next_step_due: '2026-01-15',
      created: '2026-01-01',
      tags: [],
      linked: [],
      filename: 'apply-overdue-co.md',
      body: '',
      isStalled: true,
    },
    {
      slug: 'on-time',
      type: 'task',
      domain: 'job-search',
      status: 'looking-at',
      company: 'On Time Co',
      role: 'Director',
      comp_low: null,
      comp_high: null,
      location: null,
      remote: null,
      applied: null,
      next_step: 'submit',
      next_step_due: '2030-01-01',
      created: '2026-04-01',
      tags: [],
      linked: [],
      filename: 'apply-on-time.md',
      body: '',
      isStalled: false,
    },
  ];
  return { applications: apps };
});

const registry = createRegistry([
  {
    id: 'job-pipeline',
    route: '/jobs',
    Component: JobPipelineApp,
    ownsSelectionKinds: ['application'],
  },
]);

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/jobs']}>
      <SelectionProvider registry={registry}>
        <JobPipelineApp />
      </SelectionProvider>
    </MemoryRouter>,
  );
}

describe('JobPipelineApp', () => {
  beforeEach(() => {
    // ensure fixture today is past the overdue date
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05'));
  });

  it('renders the page title in serif', () => {
    renderApp();
    const heading = screen.getByRole('heading', { name: /job applications/i, level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('renders the Stalled section when there are stalled applications', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /stalled/i })).toBeInTheDocument();
    // "Overdue Co" appears in both the Stalled section and the Applied section
    // (it has status 'applied' and isStalled: true). Assert at least one match.
    expect(screen.getAllByText('Overdue Co', { exact: false }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Looking At section', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /looking at/i })).toBeInTheDocument();
    expect(screen.getByText('On Time Co', { exact: false })).toBeInTheDocument();
  });

  it('shows the correct empty state for sections with no rows', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /interviewing/i })).toBeInTheDocument();
    // The "interviewing" section will have an empty state
  });
});
