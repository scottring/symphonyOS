// src/apps/job-pipeline/index.ts
import type { AppDef } from '@/shell/types';
import { JobPipelineApp } from './JobPipelineApp';
import { ApplicationDetailPanel } from './ApplicationDetailPanel';

export const jobPipelineAppDef: AppDef = {
  id: 'job-pipeline',
  route: '/jobs',
  Component: JobPipelineApp,
  DetailPanelComponent: ApplicationDetailPanel,
  ownsSelectionKinds: ['application'],
  // Sidebar entry omitted in P3 — wired in P5 alongside personal-os-manual update.
};
