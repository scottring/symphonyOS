// src/apps/job-pipeline/JobPipelineApp.tsx
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApplications } from './data/useApplications';
import { PipelineSection } from './components/PipelineSection';
import { ApplicationRow } from './components/ApplicationRow';
import { NewApplicationModal } from './NewApplicationModal';

export function JobPipelineApp() {
  const { applications, byStatus, stalled } = useApplications();
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = searchParams.get('archived') === '1';
  const [newOpen, setNewOpen] = useState(false);

  const visible = useMemo(() => {
    function filter<T extends { archived: boolean }>(rows: T[]): T[] {
      return rows.filter((r) => !r.archived);
    }
    return {
      stalled: filter(stalled),
      lookingAt: filter(byStatus['looking-at']),
      applied: filter(byStatus.applied),
      interviewing: filter(byStatus.interviewing),
      decided: filter(byStatus.decided),
    };
  }, [byStatus, stalled]);

  const archived = useMemo(
    () => applications.filter((a) => a.archived),
    [applications],
  );

  function toggleArchived() {
    const next = new URLSearchParams(searchParams);
    if (showArchived) next.delete('archived');
    else next.set('archived', '1');
    setSearchParams(next, { replace: true });
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 leading-relaxed">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-4xl text-neutral-900">Job Applications</h1>
        <div className="flex items-baseline gap-4">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="text-sm text-neutral-700 hover:text-neutral-900 inline-flex items-center gap-1"
          >
            <span aria-hidden="true">+</span>
            <span>New</span>
          </button>
          <button
            type="button"
            onClick={toggleArchived}
            className="text-sm text-neutral-500 underline"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-500 italic">
        Auto-rendered from <code>tasks/apply-*.md</code> in the vault.
      </p>

      {visible.stalled.length > 0 && (
        <PipelineSection
          title="Stalled"
          subtitle="These need attention."
          emptyState="Nothing stalled."
          isEmpty={visible.stalled.length === 0}
        >
          {visible.stalled.map((app) => (
            <ApplicationRow key={app.slug} app={app} showOverdue />
          ))}
        </PipelineSection>
      )}

      <PipelineSection
        title="Looking At"
        emptyState="Nothing tracked yet."
        isEmpty={visible.lookingAt.length === 0}
      >
        {visible.lookingAt.map((app) => (
          <ApplicationRow key={app.slug} app={app} />
        ))}
      </PipelineSection>

      <PipelineSection
        title="Applied"
        emptyState="Nothing in flight."
        isEmpty={visible.applied.length === 0}
      >
        {visible.applied.map((app) => (
          <ApplicationRow key={app.slug} app={app} showApplied />
        ))}
      </PipelineSection>

      <PipelineSection
        title="Interviewing"
        emptyState="Nothing interviewing."
        isEmpty={visible.interviewing.length === 0}
      >
        {visible.interviewing.map((app) => (
          <ApplicationRow key={app.slug} app={app} />
        ))}
      </PipelineSection>

      <PipelineSection
        title="Decided"
        emptyState="Nothing decided yet."
        isEmpty={visible.decided.length === 0}
      >
        {visible.decided.map((app) => (
          <ApplicationRow key={app.slug} app={app} showApplied showDecision />
        ))}
      </PipelineSection>

      {showArchived && (
        <PipelineSection
          title="Archived"
          subtitle="Hidden from the main pipeline."
          emptyState="No archived applications."
          isEmpty={archived.length === 0}
        >
          {archived.map((app) => (
            <ApplicationRow key={app.slug} app={app} showApplied />
          ))}
        </PipelineSection>
      )}

      <NewApplicationModal open={newOpen} onClose={() => setNewOpen(false)} />
    </main>
  );
}
