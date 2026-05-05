// src/apps/job-pipeline/components/StatusControl.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusControl } from './StatusControl';

describe('StatusControl', () => {
  it('renders the four statuses as a segmented control', () => {
    render(
      <StatusControl
        status="looking-at"
        decision={undefined}
        onChange={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(screen.getByRole('radio', { name: /looking at/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /applied/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /interviewing/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /decided/i })).toBeInTheDocument();
  });

  it('marks the current status as checked', () => {
    render(
      <StatusControl
        status="applied"
        decision={undefined}
        onChange={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(screen.getByRole('radio', { name: /applied/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /looking at/i })).not.toBeChecked();
  });

  it('calls onChange with the new status when a different option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue({ ok: true });
    render(
      <StatusControl
        status="looking-at"
        decision={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /applied/i }));
    expect(onChange).toHaveBeenCalledWith({ status: 'applied' });
  });

  it('shows decision options when status is decided', () => {
    render(
      <StatusControl
        status="decided"
        decision="accepted"
        onChange={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(screen.getByRole('radio', { name: /rejected/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /accepted/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /withdrawn/i })).toBeInTheDocument();
  });

  it('does not show decision options when status is not decided', () => {
    render(
      <StatusControl
        status="applied"
        decision={undefined}
        onChange={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(screen.queryByRole('radio', { name: /rejected/i })).not.toBeInTheDocument();
  });

  it('calls onChange with status decided + decision when a decision is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue({ ok: true });
    render(
      <StatusControl
        status="decided"
        decision={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /rejected/i }));
    expect(onChange).toHaveBeenCalledWith({ decision: 'rejected' });
  });

  it('shows an error message when onChange returns ok: false', async () => {
    const user = userEvent.setup();
    const onChange = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'write failed' });
    render(
      <StatusControl
        status="looking-at"
        decision={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /applied/i }));
    expect(await screen.findByText(/write failed/i)).toBeInTheDocument();
  });
});
