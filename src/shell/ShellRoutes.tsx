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
  const activeApp = registry.find((app) => {
    if (app.route === '/' || app.route === '') return pathname === '/';
    return pathname === app.route || pathname.startsWith(`${app.route}/`);
  });

  if (!activeApp) {
    return null;
  }

  return (
    <Routes>
      <Route path="/*" element={<activeApp.Component />} />
    </Routes>
  );
}
