// src/apps/job-pipeline/ApplicationDetailPanel.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { applications } from 'virtual:vault-applications';
import type { VaultApplication } from 'virtual:vault-applications';
import type { SelectionRef } from '@/shell/types';
import { useSelection } from '@/shell/providers/SelectionProvider';
import {
  patchApplication,
  type ApplicationPatch,
} from './data/applicationsClient';
import { StatusControl } from './components/StatusControl';
import { ArchiveButton } from './components/ArchiveButton';
import { AddToTodayButton } from './components/AddToTodayButton';

interface Props {
  selection: SelectionRef;
}

type Tab = 'overview' | 'notes' | 'documents';

function compString(low: number | null, high: number | null): string {
  if (low == null && high == null) return '—';
  if (low != null && high != null) {
    return `$${(low / 1000).toFixed(0)}k–$${(high / 1000).toFixed(0)}k`;
  }
  const v = low ?? high!;
  return `$${(v / 1000).toFixed(0)}k`;
}

function obsidianUrl(filename: string): string {
  // vault registered as 'scotts-world' on Scott's setup
  return `obsidian://open?vault=scotts-world&file=${encodeURIComponent('tasks/' + filename)}`;
}

function unwrapWikilink(link: string): string {
  return link.replace(/^\[\[/, '').replace(/\]\]$/, '');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ApplicationDetailPanel({ selection }: Props) {
  const { clearSelection } = useSelection();
  const [tab, setTab] = useState<Tab>('overview');
  const panelRef = useRef<HTMLElement | null>(null);
  const initial = useMemo(
    () => applications.find((a: VaultApplication) => a.slug === selection.id),
    [selection.id],
  );
  // Local state mirrors the persisted application so optimistic updates
  // re-render without waiting for an HMR reload of the virtual module.
  const [app, setApp] = useState<VaultApplication | undefined>(initial);
  const [confirm, setConfirm] = useState<string | null>(null);

  // Close on click-outside and ESC. Per feedback_panel_design.md memory:
  // click-outside-to-close is the standard for Symphony panels.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || !panelRef.current) return;
      if (panelRef.current.contains(target)) return;
      clearSelection();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') clearSelection();
    }
    // Defer attaching the click listener by a tick so the click that opened
    // the panel doesn't immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [clearSelection]);

  if (!app) {
    return (
      <aside
        ref={panelRef}
        className="fixed right-0 top-0 h-screen w-[420px] border-l border-neutral-200 bg-neutral-50 p-6"
      >
        <p className="text-neutral-500">Application not found.</p>
      </aside>
    );
  }

  async function applyPatch(
    patch: ApplicationPatch,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!app) return { ok: false, error: 'no application loaded' };
    // For status=applied without an applied date, auto-fill today so the
    // pipeline reflects the move correctly.
    const effective: ApplicationPatch = { ...patch };
    if (
      patch.status === 'applied' &&
      app.applied == null &&
      patch.applied === undefined
    ) {
      effective.applied = todayIso();
    }
    const prev = app;
    // Optimistic update: merge the patch into the local copy.
    setApp({
      ...prev,
      ...(effective.status !== undefined ? { status: effective.status } : {}),
      ...(effective.decision !== undefined
        ? { decision: effective.decision === null ? undefined : effective.decision }
        : {}),
      ...(effective.applied !== undefined ? { applied: effective.applied } : {}),
      ...(effective.next_step !== undefined ? { next_step: effective.next_step } : {}),
      ...(effective.next_step_due !== undefined ? { next_step_due: effective.next_step_due } : {}),
      ...(effective.archived !== undefined ? { archived: effective.archived } : {}),
    });
    setConfirm(null);
    const result = await patchApplication(prev.slug, effective);
    if (!result.ok) {
      setApp(prev);
      return { ok: false, error: result.error };
    }
    setApp(result.application);
    setConfirm(describeChange(effective));
    return { ok: true };
  }

  return (
    <aside
      ref={panelRef}
      className="fixed right-0 top-0 h-screen w-[420px] border-l border-neutral-200 bg-neutral-50 overflow-y-auto"
    >
      <button
        type="button"
        onClick={clearSelection}
        aria-label="Close application detail"
        className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300 hover:text-neutral-900 shadow-sm transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M4.28 3.22a.75.75 0 00-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 101.06 1.06L10 11.06l5.72 5.72a.75.75 0 101.06-1.06L11.06 10l5.72-5.72a.75.75 0 00-1.06-1.06L10 8.94 4.28 3.22z" clipRule="evenodd" />
        </svg>
      </button>
      <header className="px-6 pt-6 pb-4 pr-14">
        <h2 className="font-display text-2xl text-neutral-900">{app.company}</h2>
        <p className="text-neutral-600">{app.role}</p>
      </header>
      <div role="tablist" className="flex border-b border-neutral-200 px-6">
        {(['overview', 'notes', 'documents'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-neutral-900 text-neutral-900' : 'text-neutral-500'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="px-6 py-6">
        {tab === 'overview' && (
          <OverviewPane app={app} onPatch={applyPatch} confirm={confirm} />
        )}
        {tab === 'notes' && <NotesPane app={app} />}
        {tab === 'documents' && <DocumentsPane app={app} />}
      </div>
      <footer className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
        <a
          href={obsidianUrl(app.filename)}
          className="text-sm text-neutral-700 underline"
        >
          Edit in Obsidian
        </a>
        <ArchiveButton
          archived={app.archived}
          onToggle={(archived) => applyPatch({ archived })}
        />
      </footer>
    </aside>
  );
}

function describeChange(patch: ApplicationPatch): string {
  if (patch.archived === true) return 'Archived.';
  if (patch.archived === false) return 'Restored.';
  if (patch.status) return `Status set to ${patch.status}.`;
  if (patch.decision) return `Decision set to ${patch.decision}.`;
  return 'Saved.';
}

function OverviewPane({
  app,
  onPatch,
  confirm,
}: {
  app: VaultApplication;
  onPatch: (patch: ApplicationPatch) => Promise<{ ok: boolean; error?: string }>;
  confirm: string | null;
}) {
  const showAddToToday =
    app.next_step != null &&
    (app.next_step_due == null || app.next_step_due >= todayIso());

  return (
    <div className="space-y-5 text-sm">
      <StatusControl
        status={app.status}
        decision={app.decision}
        onChange={onPatch}
      />
      {confirm && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-neutral-500 italic"
        >
          {confirm}
        </p>
      )}
      <dl className="space-y-3">
        <Row label="Comp" value={compString(app.comp_low, app.comp_high)} />
        <Row label="Location" value={app.location ?? '—'} />
        <Row label="Remote" value={app.remote ?? '—'} />
        {app.applied && <Row label="Applied" value={app.applied} />}
        {app.next_step && <Row label="Next step" value={app.next_step} />}
        {app.next_step_due && <Row label="Due" value={app.next_step_due} />}
      </dl>
      {showAddToToday && app.next_step && (
        <AddToTodayButton
          slug={app.slug}
          filename={app.filename}
          company={app.company}
          next_step={app.next_step}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900 text-right">{value}</dd>
    </div>
  );
}

function NotesPane({ app }: { app: VaultApplication }) {
  // Render body as preformatted text. Markdown rendering is intentionally simple in v1
  // — no markdown renderer is installed in Symphony today; plain whitespace-pre-wrap
  // gives readable output. Upgrade to a full renderer if/when one is added.
  return (
    <article className="prose prose-sm max-w-none whitespace-pre-wrap text-neutral-800 leading-relaxed">
      {app.body || <em>No notes.</em>}
    </article>
  );
}

function DocumentsPane({ app }: { app: VaultApplication }) {
  if (app.linked.length === 0) {
    return <p className="text-neutral-500 italic">No linked documents.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {app.linked.map((link) => {
        const name = unwrapWikilink(link);
        // Best-effort guess at folder by prefix
        const folder = name.startsWith('resume-') || name.startsWith('cover-letter-') || name.startsWith('role-description-')
          ? 'job-search'
          : '';
        const file = folder ? `${folder}/${name}.md` : `${name}.md`;
        return (
          <li key={link}>
            <a
              href={`obsidian://open?vault=scotts-world&file=${encodeURIComponent(file)}`}
              className="text-neutral-700 underline"
            >
              {name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
