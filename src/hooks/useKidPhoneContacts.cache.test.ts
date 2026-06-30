import { describe, it, expect } from 'vitest';
import { readCachedContacts, writeCachedContacts, partitionContacts, CONTACTS_CACHE_KEY } from './useKidPhoneContacts';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('contacts cache helpers', () => {
  it('round-trips through the store', () => {
    const store = memStore();
    writeCachedContacts(store, [{ contactId: 'g', name: 'Grandma', favorite: true, enabled: true }]);
    expect(store.getItem(CONTACTS_CACHE_KEY)).toBeTruthy();
    expect(readCachedContacts(store)).toHaveLength(1);
  });
  it('returns [] for missing or corrupt cache', () => {
    expect(readCachedContacts(memStore())).toEqual([]);
    const bad = memStore(); bad.setItem(CONTACTS_CACHE_KEY, 'not json');
    expect(readCachedContacts(bad)).toEqual([]);
  });
});

describe('partitionContacts', () => {
  it('splits favorites from others, each sorted by name', () => {
    const { favorites, others } = partitionContacts([
      { contactId: '2', name: 'Zed', favorite: false, enabled: true },
      { contactId: '1', name: 'Anna', favorite: false, enabled: true },
      { contactId: '3', name: 'Gary', favorite: true, enabled: true },
      { contactId: '4', name: 'Beth', favorite: true, enabled: true },
    ]);
    expect(favorites.map((c) => c.name)).toEqual(['Beth', 'Gary']);
    expect(others.map((c) => c.name)).toEqual(['Anna', 'Zed']);
  });
});
