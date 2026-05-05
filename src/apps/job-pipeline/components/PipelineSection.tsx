// src/apps/job-pipeline/components/PipelineSection.tsx
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  emptyState: string;
  children: ReactNode;
  isEmpty: boolean;
}

export function PipelineSection({ title, subtitle, emptyState, children, isEmpty }: Props) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="font-display text-2xl text-neutral-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-neutral-500 italic">{subtitle}</p>}
      <div className="mt-6">
        {isEmpty ? (
          <p className="text-neutral-400 italic">{emptyState}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
