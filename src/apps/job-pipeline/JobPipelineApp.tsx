// src/apps/job-pipeline/JobPipelineApp.tsx
import { useApplications } from './data/useApplications';
import { PipelineSection } from './components/PipelineSection';
import { ApplicationRow } from './components/ApplicationRow';

export function JobPipelineApp() {
  const { byStatus, stalled } = useApplications();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 leading-relaxed">
      <h1 className="font-display text-4xl text-neutral-900">Job Applications</h1>
      <p className="mt-2 text-sm text-neutral-500 italic">
        Auto-rendered from <code>tasks/apply-*.md</code> in the vault.
      </p>

      {stalled.length > 0 && (
        <PipelineSection
          title="Stalled"
          subtitle="These need attention."
          emptyState="Nothing stalled."
          isEmpty={stalled.length === 0}
        >
          {stalled.map((app) => (
            <ApplicationRow key={app.slug} app={app} showOverdue />
          ))}
        </PipelineSection>
      )}

      <PipelineSection
        title="Looking At"
        emptyState="Nothing tracked yet."
        isEmpty={byStatus['looking-at'].length === 0}
      >
        {byStatus['looking-at'].map((app) => (
          <ApplicationRow key={app.slug} app={app} />
        ))}
      </PipelineSection>

      <PipelineSection
        title="Applied"
        emptyState="Nothing in flight."
        isEmpty={byStatus.applied.length === 0}
      >
        {byStatus.applied.map((app) => (
          <ApplicationRow key={app.slug} app={app} showApplied />
        ))}
      </PipelineSection>

      <PipelineSection
        title="Interviewing"
        emptyState="Nothing interviewing."
        isEmpty={byStatus.interviewing.length === 0}
      >
        {byStatus.interviewing.map((app) => (
          <ApplicationRow key={app.slug} app={app} />
        ))}
      </PipelineSection>

      <PipelineSection
        title="Decided"
        emptyState="Nothing decided yet."
        isEmpty={byStatus.decided.length === 0}
      >
        {byStatus.decided.map((app) => (
          <ApplicationRow key={app.slug} app={app} showApplied showDecision />
        ))}
      </PipelineSection>
    </main>
  );
}
