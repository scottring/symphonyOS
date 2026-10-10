import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// No network in these tests: the contacts hook and placeCall are mocked, so
// nothing here can ever ring a real phone.
const book = vi.hoisted(() => ({
  favorites: [
    { contactId: 'g', name: 'Grandma', favorite: true, enabled: true },
    { contactId: 'x', name: 'Old Number', favorite: true, enabled: false },
  ],
  others: [
    { contactId: 'i', name: 'Iris', favorite: false, enabled: true },
    { contactId: 'z', name: 'Switched Off', favorite: false, enabled: false },
  ],
}));
vi.mock('@/hooks/useKidPhoneContacts', () => ({
  useKidPhoneContacts: () => ({
    contacts: [...book.favorites, ...book.others],
    favorites: book.favorites,
    others: book.others,
    loading: false,
    error: undefined,
  }),
  callableContacts: (cs: { enabled?: boolean }[]) => cs.filter((c) => c.enabled !== false),
}));
const handset = vi.hoisted(() => ({ offHook: false }));
vi.mock('@/hooks/useHandsetState', () => ({
  useHandsetState: () => ({ offHook: handset.offHook }),
}));
const placeCall = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }));

import { WallV2PhoneScreen } from './WallV2PhoneScreen';

describe('WallV2PhoneScreen', () => {
  beforeEach(() => { placeCall.mockClear(); placeCall.mockResolvedValue({ ok: true }); handset.offHook = false; });

  // Scott, 2026-10-04: the kids' phone is called kidsPhone (not SymphonyBell).
  it('is called kidsPhone', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('kidsPhone');
  });

  it('hides contacts the allowlist has disabled', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Call Grandma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call Iris' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Old Number/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Switched Off/ })).toBeNull();
  });

  it('requires a confirm naming the recipient and the line before placing the call', async () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    expect(placeCall).not.toHaveBeenCalled();            // confirm gates the call
    const dialog = screen.getByRole('dialog', { name: 'Call Grandma?' });
    expect(within(dialog).getByText('Call Grandma?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Rings the kidsPhone handset in the house/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(placeCall).toHaveBeenCalledWith({ contactId: 'g', source: 'kiosk' }));
    expect(placeCall).toHaveBeenCalledTimes(1);
  });

  it('shows a quiet-hours message when the call is soft-rejected', async () => {
    placeCall.mockResolvedValueOnce({ ok: false, reason: 'quiet_hours' });
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText(/quiet hours/i)).toBeTruthy());
  });

  it('Cancel before dialing returns to the grid without calling', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(placeCall).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Iris/ })).toBeTruthy();
  });

  it('after dialing there is no Cancel or Hang up — only "Close this screen", and it says the call continues', async () => {
    const onClose = vi.fn();
    render(<WallV2PhoneScreen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText('Calling Grandma…')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hang up/i })).toBeNull();
    expect(screen.getByText(/The call continues on the handset/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close this screen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('while the request is in flight the button is already "Close this screen", and a late response is ignored', async () => {
    let resolvePlaceCall: (v: { ok: boolean }) => void = () => {};
    placeCall.mockImplementationOnce(() => new Promise((resolve) => { resolvePlaceCall = resolve; }));
    const onClose = vi.fn();
    render(<WallV2PhoneScreen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(screen.getByText(/Starting the call to Grandma/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close this screen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    resolvePlaceCall({ ok: true });
    await Promise.resolve();
    expect(screen.queryByText(/Calling Grandma/)).not.toBeInTheDocument();
  });

  it('never closes itself on a timer after dialing', async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<WallV2PhoneScreen onClose={onClose} embedded />);
      fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
      fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(10 * 60_000);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Close this screen' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('embedded in the kiosk frame it has no close X of its own', () => {
    render(<WallV2PhoneScreen onClose={() => {}} embedded />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('WallV2PhoneScreen handset awareness', () => {
  beforeEach(() => { placeCall.mockClear(); placeCall.mockResolvedValue({ ok: true }); handset.offHook = false; });

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
