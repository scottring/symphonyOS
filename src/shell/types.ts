// src/shell/types.ts
import type { ComponentType } from 'react';

export type SelectionRef = {
  kind: string;
  id: string;
};

export type SidebarSpec = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  order: number;
};

export interface AppDef {
  /** Stable id used by Shell internally and in app registry validation */
  id: string;
  /** Route path mounted by ShellRoutes (e.g., '/jobs', '/wall-v2'). May contain :params. */
  route: string;
  /** True for the default app at '/' (only one app may be index) */
  index?: boolean;
  /** Sidebar metadata; omit to hide from sidebar */
  sidebar?: SidebarSpec;
  /** Top-level route component for this app */
  Component: ComponentType;
  /** Component that renders into the global DetailPanel for selections of `ownsSelectionKinds` */
  DetailPanelComponent?: ComponentType<{ selection: SelectionRef }>;
  /** Selection kinds this app owns (e.g., ['task'] or ['application']). Must be unique across registry. */
  ownsSelectionKinds?: string[];
  /**
   * If true, the app renders without Shell chrome (sidebar / topbar / etc.).
   * Default (omitted or false) wraps the app's Component in <ShellLayout>.
   * Use this for kiosk/fullscreen surfaces like Wall.
   */
  chromeless?: boolean;
}

export type SelectionResolver = (kind: string) => AppDef | undefined;
