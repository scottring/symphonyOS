// src/apps/job-pipeline/components/ApplicationRow.tsx
import { useSelection } from '@/shell/providers/SelectionProvider';
// TODO: consolidate types — virtual-applications.d.ts re-states ParsedApplication
// shape. Using the inline VaultApplication type here so the import works without
// extending tsconfig include paths to vite/.
import type { VaultApplication } from 'virtual:vault-applications';

interface Props {
  app: VaultApplication;
  showOverdue?: boolean;
  showApplied?: boolean;
  showDecision?: boolean;
}

function compRange(low: number | null, high: number | null): string {
  if (low == null && high == null) return '—';
  if (low != null && high != null) {
    return `$${(low / 1000).toFixed(0)}k–$${(high / 1000).toFixed(0)}k`;
  }
  const v = low ?? high!;
  return `$${(v / 1000).toFixed(0)}k`;
}

function daysOverdue(due: string | null): number {
  if (!due) return 0;
  const today = new Date();
  const dueDate = new Date(due);
  const ms = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function ApplicationRow({ app, showOverdue, showApplied, showDecision }: Props) {
  const { setSelection } = useSelection();
  return (
    <button
      onClick={() => setSelection({ kind: 'application', id: app.slug })}
      className="block w-full text-left py-4 border-b border-neutral-200 last:border-0 hover:bg-neutral-50 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="font-display text-lg text-neutral-900">
            {app.company}
            <span className="text-neutral-500 font-normal"> — {app.role}</span>
          </div>
          {app.next_step && (
            <div className="text-sm text-neutral-600 mt-1 italic">
              next: {app.next_step}
            </div>
          )}
        </div>
        <div className="text-sm text-neutral-500 text-right whitespace-nowrap">
          <div>{compRange(app.comp_low, app.comp_high)}</div>
          {app.location && <div className="text-xs text-neutral-400">{app.location}</div>}
        </div>
      </div>
      <div className="mt-2 text-xs text-neutral-500 flex gap-4">
        {showApplied && app.applied && <span>applied {app.applied}</span>}
        {app.next_step_due && !showOverdue && <span>due {app.next_step_due}</span>}
        {showOverdue && app.next_step_due && (
          <span className="text-accent-500">{daysOverdue(app.next_step_due)} days overdue</span>
        )}
        {showDecision && app.decision && (
          <span className="italic">{app.decision}</span>
        )}
      </div>
    </button>
  );
}
