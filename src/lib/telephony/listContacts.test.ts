import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
import { supabase } from '@/lib/supabase';
import { fetchKidPhoneContacts } from './listContacts';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

describe('fetchKidPhoneContacts', () => {
  it('returns contacts on success', async () => {
    invoke.mockResolvedValueOnce({
      data: { contacts: [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }] },
      error: null,
    });
    const r = await fetchKidPhoneContacts();
    expect(r.ok).toBe(true);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0].name).toBe('Grandma');
  });
  it('returns ok:false with an empty list on error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const r = await fetchKidPhoneContacts();
    expect(r.ok).toBe(false);
    expect(r.contacts).toEqual([]);
    expect(r.error).toBe('boom');
  });
});
