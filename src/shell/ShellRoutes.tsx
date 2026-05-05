// src/shell/ShellRoutes.tsx
import { Route, Routes } from 'react-router-dom';
import type { AppRegistry } from './appRegistry';

interface Props {
  registry: AppRegistry;
}

export function ShellRoutes({ registry }: Props) {
  return (
    <Routes>
      {registry.map((app) => {
        // Every app gets a wildcard so it can host nested routes internally.
        // For an app at '/', the path becomes '/*'. React Router ranks specificity,
        // so '/wall/*' wins over '/*' for /wall/... URLs.
        const path = app.route === '/' ? '/*' : `${app.route}/*`;
        return <Route key={app.id} path={path} element={<app.Component />} />;
      })}
    </Routes>
  );
}
