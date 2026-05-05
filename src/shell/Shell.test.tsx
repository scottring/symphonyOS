// src/shell/Shell.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Shell } from './Shell';
import { createRegistry } from './appRegistry';
import type { AppDef } from './types';

const ChromedApp: AppDef = {
  id: 'chromed',
  route: '/chromed',
  Component: () => <div data-testid="chromed-content">chromed content</div>,
};

const ChromelessApp: AppDef = {
  id: 'chromeless',
  route: '/chromeless',
  Component: () => <div data-testid="chromeless-content">chromeless content</div>,
  chromeless: true,
};

const registry = createRegistry([ChromedApp, ChromelessApp]);

const StubLayout = ({ children }: { children: ReactNode }) => (
  <div data-testid="layout-chrome">{children}</div>
);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/chromed/*" element={<Shell registry={registry} Layout={StubLayout} />} />
        <Route path="/chromeless/*" element={<Shell registry={registry} Layout={StubLayout} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shell chrome wrapping', () => {
  it('wraps a non-chromeless app in the layout', () => {
    renderAt('/chromed');
    expect(screen.getByTestId('layout-chrome')).toBeTruthy();
    expect(screen.getByTestId('chromed-content')).toBeTruthy();
  });

  it('skips the layout for a chromeless app', () => {
    renderAt('/chromeless');
    expect(screen.queryByTestId('layout-chrome')).toBeNull();
    expect(screen.getByTestId('chromeless-content')).toBeTruthy();
  });
});
