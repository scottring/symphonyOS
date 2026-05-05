// src/apps/job-pipeline/ApplicationDetailPanel.tsx
import { useMemo, useState } from 'react';
import { applications } from 'virtual:vault-applications';
import type { VaultApplication } from 'virtual:vault-applications';
import type { SelectionRef } from '@/shell/types';

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

export function ApplicationDetailPanel({ selection }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const app = useMemo(
    () => applications.find((a: VaultApplication) => a.slug === selection.id),
    [selection.id],
  );

  if (!app) {
    return (
      <aside className="fixed right-0 top-0 h-screen w-[420px] border-l border-neutral-200 bg-neutral-50 p-6">
        <p className="text-neutral-500">Application not found.</p>
      </aside>
    );
  }

  return (
    <aside className="fixed right-0 top-0 h-screen w-[420px] border-l border-neutral-200 bg-neutral-50 overflow-y-auto">
      <header className="px-6 pt-6 pb-4">
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
        {tab === 'overview' && <OverviewPane app={app} />}
        {tab === 'notes' && <NotesPane app={app} />}
        {tab === 'documents' && <DocumentsPane app={app} />}
      </div>
      <footer className="px-6 py-4 border-t border-neutral-200">
        <a
          href={obsidianUrl(app.filename)}
          className="text-sm text-neutral-700 underline"
        >
          Edit in Obsidian
        </a>
      </footer>
    </aside>
  );
}

function OverviewPane({ app }: { app: VaultApplication }) {
  return (
    <dl className="space-y-3 text-sm">
      <Row label="Status" value={app.status + (app.decision ? ` (${app.decision})` : '')} />
      <Row label="Comp" value={compString(app.comp_low, app.comp_high)} />
      <Row label="Location" value={app.location ?? '—'} />
      <Row label="Remote" value={app.remote ?? '—'} />
      {app.applied && <Row label="Applied" value={app.applied} />}
      {app.next_step && <Row label="Next step" value={app.next_step} />}
      {app.next_step_due && <Row label="Due" value={app.next_step_due} />}
    </dl>
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
