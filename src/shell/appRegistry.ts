// src/shell/appRegistry.ts
import type { AppDef } from './types';

export type AppRegistry = ReadonlyArray<AppDef>;

export function createRegistry(apps: AppDef[]): AppRegistry {
  const ids = new Set<string>();
  const claimedKinds = new Map<string, string>();
  let indexId: string | null = null;

  for (const app of apps) {
    if (ids.has(app.id)) {
      throw new Error(`duplicate app id "${app.id}" in registry`);
    }
    ids.add(app.id);

    if (app.index) {
      if (indexId !== null) {
        throw new Error(
          `multiple index apps in registry: "${indexId}" and "${app.id}"`,
        );
      }
      indexId = app.id;
    }

    for (const kind of app.ownsSelectionKinds ?? []) {
      const previous = claimedKinds.get(kind);
      if (previous) {
        throw new Error(
          `selection kind "${kind}" already claimed by "${previous}"; cannot also be claimed by "${app.id}"`,
        );
      }
      claimedKinds.set(kind, app.id);
    }
  }

  return apps;
}

export function resolveAppForSelection(
  registry: AppRegistry,
  kind: string,
): AppDef | undefined {
  return registry.find((app) =>
    app.ownsSelectionKinds?.includes(kind),
  );
}

// Live registry — populated phase-by-phase. Empty for P1.
export const appRegistry: AppRegistry = createRegistry([]);
