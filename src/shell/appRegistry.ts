// src/shell/appRegistry.ts
import type { AppDef } from './types';
import { wallV2AppDef } from '@/apps/wall-v2';
import { jobPipelineAppDef } from '@/apps/job-pipeline';
import { tasksAppDef } from '@/apps/tasks';
import { homeAppDef } from '@/apps/home';
import { mealsAppDef } from '@/apps/meals';
import { settingsAppDef } from '@/apps/settings';
import { historyAppDef } from '@/apps/history';
import { listsAppDef } from '@/apps/lists';
import { contactsAppDef } from '@/apps/contacts';
import { documentsAppDef } from '@/apps/documents';
import { routinesAppDef } from '@/apps/routines';
// import { medsAppDef } from '@/apps/meds';  // withheld — see Sidebar.tsx
import { projectsAppDef } from '@/apps/projects';
import { goalsAppDef } from '@/apps/goals';
import { familyAppDef } from '@/apps/family';
import { agentAppDef } from '@/apps/agent';
import { usAppDef } from '@/apps/us';

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

// Live registry — populated phase-by-phase. Wall added in P2, Job Pipeline in P3, Tasks in P4.
export const appRegistry: AppRegistry = createRegistry([
  wallV2AppDef,
  jobPipelineAppDef,
  tasksAppDef,
  homeAppDef,
  mealsAppDef,
  settingsAppDef,
  historyAppDef,
  listsAppDef,
  contactsAppDef,
  documentsAppDef,
  routinesAppDef,
  // medsAppDef — withheld, see the note in Sidebar.tsx. The app itself still
  // builds; it just isn't mounted.
  projectsAppDef,
  goalsAppDef,
  familyAppDef,
  agentAppDef,
  usAppDef,
]);
