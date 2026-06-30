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
const placeCall = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }));

import { WallV2PhoneScreen } from './WallV2PhoneScreen';

describe('WallV2PhoneScreen', () => {
  beforeEach(() => placeCall.mockClear());

  it('requires a confirm before placing the call', async () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Grandma/ }));
    expect(placeCall).not.toHaveBeenCalled();            // confirm gates the call
    fireEvent.click(screen.getByRole('button', { name: /^Call$/ }));
    await waitFor(() => expect(placeCall).toHaveBeenCalledWith({ contactId: 'g', source: 'kiosk' }));
  });

  it('cancel returns to the grid without calling', () => {
    render(<WallV2PhoneScreen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(placeCall).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Iris/ })).toBeTruthy();
  });
});
