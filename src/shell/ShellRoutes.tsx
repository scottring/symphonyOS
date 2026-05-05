// src/shell/ShellRoutes.tsx
import { Route, Routes, useLocation } from 'react-router-dom';
import type { AppRegistry } from './appRegistry';

interface Props {
  registry: AppRegistry;
}

export function ShellRoutes({ registry }: Props) {
  const { pathname } = useLocation();

  // Shell is mounted at a per-app prefix in main.tsx (e.g. /jobs/*, /wall/*),
  // which means React Router has already consumed that prefix by the time we
  // reach this component. Inner <Routes> see paths relative to the parent
  // mount, so we cannot match against absolute `app.route` values like
  // "/jobs/*". Instead we identify the active app by its absolute pathname,
  // then render its Component at the relative wildcard so nested routes
  // (e.g. /jobs/foo) still resolve.
  //
  // Two-pass resolution:
  // 1. Find any app whose `route` is a prefix of pathname (excluding the
  //    index app — its `route` is '/' which would match everything).
  // 2. If nothing matched, fall through to the app marked `index: true`
  //    (the default app at `/`). This is how /today, /inbox, /task/:id
  //    flow to tasks at cutover.
  const explicitMatch = registry.find((app) => {
    if (app.index) return false;
    if (app.route === '/' || app.route === '') return pathname === '/';
    return pathname === app.route || pathname.startsWith(`${app.route}/`);
  });
  const indexApp = registry.find((app) => app.index);
  const activeApp = explicitMatch ?? indexApp;

  if (!activeApp) {
    return null;
  }

  return (
    <Routes>
      <Route path="/*" element={<activeApp.Component />} />
    </Routes>
  );
}
