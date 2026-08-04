import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useKidPhoneContacts', () => ({
  useKidPhoneContacts: () => ({
    contacts: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }],
    favorites: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }],
    others: [{ contactId: 'i', name: 'Iris', favorite: false, enabled: true }],
    loading: false,
    error: undefined,
  }),
}));
const handset = vi.hoisted(() => ({ offHook: false }));
vi.mock('@/hooks/useHandsetState', () => ({
  useHandsetState: () => ({ offHook: handset.offHook }),
}));
const placeCall = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }));

import { WallV2PhoneScreen } from './WallV2PhoneScreen';

describe('WallV2PhoneScreen', () => {
  beforeEach(() => { placeCall.mockClear(); handset.offHook = false; });

  it('requires a confirm before placing the call', async () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    expect(placeCall).not.toHaveBeenCalled();            // confirm gates the call
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(placeCall).toHaveBeenCalledWith({ contactId: 'g', source: 'kiosk' }));
  });

  it('shows a quiet-hours message when the call is soft-rejected', async () => {
    placeCall.mockResolvedValueOnce({ ok: false, reason: 'quiet_hours' });
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText(/quiet hours/i)).toBeTruthy());
  });

  it('cancel returns to the grid without calling', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(placeCall).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Iris/ })).toBeTruthy();
  });

  it('cancel while "Calling…" escapes the modal, and a late response is ignored', async () => {
    let resolvePlaceCall: (v: { ok: boolean }) => void = () => {};
    placeCall.mockImplementationOnce(() => new Promise((resolve) => { resolvePlaceCall = resolve; }));
    const onClose = vi.fn();
    render(<WallV2PhoneScreen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText(/Calling Grandma/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(screen.getByRole('button', { name: /Grandma/ })).toBeTruthy(); // back to grid, not stuck

    resolvePlaceCall({ ok: true });
    await Promise.resolve();
    expect(screen.queryByText(/Calling Grandma/)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('WallV2PhoneScreen handset awareness', () => {
  beforeEach(() => { placeCall.mockClear(); handset.offHook = false; });

  it('tells you to pick up the phone when the receiver is down', async () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText(/now pick up the phone/i)).toBeTruthy());
  });

  it('says connecting when you are already holding the receiver', async () => {
    handset.offHook = true;
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText(/connecting to grandma/i)).toBeTruthy());
  });

  it('hints that the phone is in hand when off-hook', () => {
    handset.offHook = true;
    render(<WallV2PhoneScreen onClose={() => {}} />);
    expect(screen.getByText(/holding the phone/i)).toBeTruthy();
  });

  it('shows no off-hook hint when the receiver is down', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    expect(screen.queryByText(/holding the phone/i)).toBeNull();
  });
});
