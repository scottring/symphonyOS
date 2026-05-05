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
  sidebar: {
    label: 'Jobs',
    icon: Briefcase,
    order: 90, // place near the bottom of the registry-driven entries
  },
};
