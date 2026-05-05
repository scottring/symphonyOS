// src/shell/appRegistry.test.ts
import { describe, expect, it } from 'vitest';
import { createRegistry, resolveAppForSelection } from './appRegistry';
import type { AppDef } from './types';

const fakeApp = (
  id: string,
  ownsSelectionKinds: string[] = [],
  index = false,
): AppDef => ({
  id,
  route: `/${id}`,
  index,
  Component: () => null,
  ownsSelectionKinds,
});

describe('createRegistry', () => {
  it('accepts an empty registry', () => {
    expect(() => createRegistry([])).not.toThrow();
  });

  it('accepts apps with disjoint selection kinds', () => {
    expect(() =>
      createRegistry([fakeApp('a', ['task']), fakeApp('b', ['application'])]),
    ).not.toThrow();
  });

  it('throws when two apps claim the same selection kind', () => {
    expect(() =>
      createRegistry([fakeApp('a', ['task']), fakeApp('b', ['task'])]),
    ).toThrowError(/selection kind "task".*claimed by/i);
  });

  it('throws when two apps are marked index', () => {
    expect(() =>
      createRegistry([
        fakeApp('a', [], true),
        fakeApp('b', [], true),
      ]),
    ).toThrowError(/multiple index apps/i);
  });

  it('throws on duplicate ids', () => {
    expect(() =>
      createRegistry([fakeApp('a'), fakeApp('a')]),
    ).toThrowError(/duplicate app id/i);
  });
});

describe('resolveAppForSelection', () => {
  it('returns the owning app for a known kind', () => {
    const registry = createRegistry([
      fakeApp('tasks', ['task']),
      fakeApp('jobs', ['application']),
    ]);
    expect(resolveAppForSelection(registry, 'task')?.id).toBe('tasks');
    expect(resolveAppForSelection(registry, 'application')?.id).toBe('jobs');
  });

  it('returns undefined for an unknown kind', () => {
    const registry = createRegistry([fakeApp('tasks', ['task'])]);
    expect(resolveAppForSelection(registry, 'application')).toBeUndefined();
  });
});
