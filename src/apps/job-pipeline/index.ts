// src/apps/job-pipeline/index.ts
import { Briefcase } from 'lucide-react';
import type { AppDef } from '@/shell/types';
import { JobPipelineApp } from './JobPipelineApp';
import { ApplicationDetailPanel } from './ApplicationDetailPanel';

export const jobPipelineAppDef: AppDef = {
  id: 'job-pipeline',
  route: '/jobs',
  Component: JobPipelineApp,
  DetailPanelComponent: ApplicationDetailPanel,
  ownsSelectionKinds: ['application'],
  // ApplicationDetailPanel renders at w-[420px], not the 480 default.
  detailPanelWidth: 420,
  sidebar: {
    label: 'Jobs',
    icon: Briefcase,
    order: 90, // place near the bottom of the registry-driven entries
  },
};
