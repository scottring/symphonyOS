// src/apps/job-pipeline/components/StatusControl.tsx
//
// Calm segmented control for application status (and decision when decided).
// onChange is called with a *partial* patch — the parent decides whether to
// optimistically apply, persist, and surface a toast.
import { useState } from 'react';
import type { ApplicationPatch } from '../data/applicationsClient';

type Status = 'looking-at' | 'applied' | 'interviewing' | 'decided';
type Decision = 'rejected' | 'accepted' | 'withdrawn';

interface Props {
  status: Status;
  decision: Decision | undefined;
  onChange: (patch: ApplicationPatch) => Promise<{ ok: boolean; error?: string }>;
}

const STATUSES: { value: Status; label: string }[] = [
  { value: 'looking-at', label: 'Looking at' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'decided', label: 'Decided' },
];

const DECISIONS: { value: Decision; label: string }[] = [
  { value: 'rejected', label: 'Rejected' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export function StatusControl({ status, decision, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function pick(patch: ApplicationPatch) {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await onChange(patch);
    setPending(false);
    if (!result.ok && result.error) setError(result.error);
  }

  return (
    <div>
      <fieldset className="border-0 p-0 m-0">
        <legend className="text-neutral-500 text-sm mb-2">Status</legend>
        <div role="radiogroup" className="flex flex-wrap gap-1 rounded-md border border-neutral-200 p-1 bg-white">
          {STATUSES.map((opt) => {
            const checked = status === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex-1 text-center text-sm cursor-pointer rounded-sm px-2 py-1 transition-colors ${
                  checked
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={opt.value}
                  checked={checked}
                  disabled={pending}
                  onChange={() => pick({ status: opt.value })}
                  className="sr-only"
                  aria-label={opt.label}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {status === 'decided' && (
        <fieldset className="border-0 p-0 m-0 mt-3">
          <legend className="text-neutral-500 text-sm mb-2">Decision</legend>
          <div role="radiogroup" className="flex gap-1 rounded-md border border-neutral-200 p-1 bg-white">
            {DECISIONS.map((opt) => {
              const checked = decision === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex-1 text-center text-sm cursor-pointer rounded-sm px-2 py-1 transition-colors ${
                    checked
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={opt.value}
                    checked={checked}
                    disabled={pending}
                    onChange={() => pick({ decision: opt.value })}
                    className="sr-only"
                    aria-label={opt.label}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <p className="mt-2 text-xs text-accent-500">{error}</p>
      )}
    </div>
  );
}
