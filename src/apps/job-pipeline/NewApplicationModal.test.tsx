// src/apps/job-pipeline/NewApplicationModal.test.tsx
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SelectionProvider } from '@/shell/providers/SelectionProvider';
import { createRegistry } from '@/shell/appRegistry';
import { NewApplicationModal } from './NewApplicationModal';
import type { VaultApplication } from 'virtual:vault-applications';

vi.mock('virtual:vault-applications', () => ({ applications: [] }));

const SAMPLE: VaultApplication = {
  slug: 'acme-engineer',
  type: 'task',
  domain: 'job-search',
  status: 'looking-at',
  company: 'Acme',
  role: 'Engineer',
  comp_low: null,
  comp_high: null,
  location: null,
  remote: null,
  applied: null,
  next_step: 'Submit application',
  next_step_due: '2026-05-10',
  created: '2026-05-05',
  tags: [],
  linked: [],
  filename: 'apply-acme-engineer.md',
  body: '',
  isStalled: false,
  archived: false,
};

const registry = createRegistry([
  {
    id: 'job-pipeline',
    route: '/jobs',
    Component: () => null,
    ownsSelectionKinds: ['application'],
  },
]);

function renderModal(props: { open: boolean; onClose: () => void }) {
  return render(
    <MemoryRouter initialEntries={['/jobs']}>
      <SelectionProvider registry={registry}>
        <NewApplicationModal {...props} />
      </SelectionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-05T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NewApplicationModal', () => {
  it('does not render when closed', () => {
    renderModal({ open: false, onClose: () => {} });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the heading and required fields when open', () => {
    renderModal({ open: true, onClose: () => {} });
    expect(
      screen.getByRole('heading', { name: /track a new application/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Company/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Role/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Status$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Comp low/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Comp high/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Location/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Remote/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Next step/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Due/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tags/)).toBeInTheDocument();
  });

  it('disables Create until Company and Role are filled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal({ open: true, onClose: () => {} });
    const submit = screen.getByRole('button', { name: /create/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Company/), 'Acme');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Role/), 'Engineer');
    expect(submit).toBeEnabled();
  });

  it('submits the form and closes on success', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(SAMPLE), { status: 201 }),
      );
    const onClose = vi.fn();
    renderModal({ open: true, onClose });

    await user.type(screen.getByLabelText(/Company/), 'Acme');
    await user.type(screen.getByLabelText(/Role/), 'Engineer');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/__vault/applications',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.company).toBe('Acme');
    expect(body.role).toBe('Engineer');
    expect(body.status).toBe('looking-at');
    expect(body.next_step_due).toBe('2026-05-10');
  });

  it('surfaces server error and keeps the dialog open', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'company is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const onClose = vi.fn();
    renderModal({ open: true, onClose });

    await user.type(screen.getByLabelText(/Company/), 'Acme');
    await user.type(screen.getByLabelText(/Role/), 'Engineer');
    await user.click(screen.getByRole('button', { name: /create/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('company is required');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = renderModal({ open: true, onClose });
    // The backdrop is the outermost div with the fixed inset-0 class.
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.mouseDown(backdrop, { target: backdrop, currentTarget: backdrop });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when ESC is pressed', () => {
    const onClose = vi.fn();
    renderModal({ open: true, onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
