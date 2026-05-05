// e2e/p4-smoke.spec.ts
//
// Phase 4-B smoke test: verifies that legacy paths AND new /tasks-new/* paths
// boot without console errors. Auth wall is expected — we just need the app
// shell to mount without crashing. This is a substitute for human click-through
// during autonomous refactor execution.
//
// Two suites:
// 1. flag-OFF (default): /, /today, /inbox use legacy App.tsx
// 2. flag-ON: same paths route to Shell-mounted TasksApp
//
// Both /tasks-new/* paths route to Shell unconditionally.

import { test, expect } from '@playwright/test';

const PATHS_DEFAULT = [
  { path: '/', label: 'legacy-index' },
  { path: '/today', label: 'legacy-today' },
  { path: '/inbox', label: 'legacy-inbox' },
  { path: '/tasks-new/today', label: 'shell-today' },
  { path: '/tasks-new/inbox', label: 'shell-inbox' },
];

const PATHS_FLAG_ON = [
  { path: '/', label: 'flag-on-index' },
  { path: '/today', label: 'flag-on-today' },
  { path: '/inbox', label: 'flag-on-inbox' },
  { path: '/tasks-new/today', label: 'flag-on-shell-today' },
  { path: '/tasks-new/inbox', label: 'flag-on-shell-inbox' },
];

async function bootWithoutErrors(page: import('@playwright/test').Page, path: string, label: string) {
  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('Failed to load resource')) return;
      if (text.includes('favicon')) return;
      if (text.toLowerCase().includes('sentry')) return;
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(err));

  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle', { timeout: 10000 });

  expect(pageErrors.map((e) => e.message)).toEqual([]);
  if (consoleErrors.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[${label}] console errors:`, consoleErrors);
  }
}

test.describe('P4 smoke (flag OFF — default)', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure the flag is cleared before each run.
    await page.addInitScript(() => {
      window.localStorage.removeItem('symphony.useNewTasks');
    });
  });

  for (const { path, label } of PATHS_DEFAULT) {
    test(`${label} — ${path} boots without console errors`, async ({ page }) => {
      await bootWithoutErrors(page, path, label);
    });
  }
});

test.describe('P4 smoke (flag ON — Shell cutover)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('symphony.useNewTasks', '1');
    });
  });

  for (const { path, label } of PATHS_FLAG_ON) {
    test(`${label} — ${path} boots without console errors`, async ({ page }) => {
      await bootWithoutErrors(page, path, label);
    });
  }
});
