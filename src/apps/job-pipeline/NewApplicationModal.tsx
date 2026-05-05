// src/apps/job-pipeline/NewApplicationModal.tsx
//
// Quick-create modal for tracking-only applications. Posts to the vault
// write-back endpoint and, on success, navigates to the new app's detail
// panel via the SelectionProvider.
//
// For full asset generation (resume + cover letter + role description) the
// /apply Claude Code slash command remains the right tool — this modal
// intentionally does not compete with that.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelection } from '@/shell/providers/SelectionProvider';
import {
  createApplication,
  type NewApplicationInput,
} from './data/applicationsClient';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Status = NonNullable<NewApplicationInput['status']>;
type Remote = 'onsite' | 'hybrid' | 'remote' | 'unspecified';

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'looking-at', label: 'Looking at' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'decided', label: 'Decided' },
];

const REMOTE_OPTIONS: { value: Remote; label: string }[] = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDueIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 5);
  return d.toISOString().slice(0, 10);
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function NewApplicationModal({ open, onClose }: Props) {
  const { setSelection } = useSelection();
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);

  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<Status>('looking-at');
  const [compLow, setCompLow] = useState('');
  const [compHigh, setCompHigh] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState<Remote>('unspecified');
  const [nextStep, setNextStep] = useState('');
  const [due, setDue] = useState(defaultDueIso());
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => company.trim().length > 0 && role.trim().length > 0 && !submitting,
    [company, role, submitting],
  );

  // Reset form whenever the modal is re-opened. Also stash the trigger
  // element so we can restore focus to it on close.
  useEffect(() => {
    if (!open) return;
    triggerElRef.current = (document.activeElement as HTMLElement) ?? null;
    setCompany('');
    setRole('');
    setStatus('looking-at');
    setCompLow('');
    setCompHigh('');
    setLocation('');
    setRemote('unspecified');
    setNextStep('');
    setDue(defaultDueIso());
    setTags('');
    setError(null);
    setSubmitting(false);
    // Focus the company field after the next paint.
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // ESC closes; restore focus to trigger on close.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Restore focus on close.
  useEffect(() => {
    if (open) return;
    const el = triggerElRef.current;
    if (el && typeof el.focus === 'function') {
      el.focus();
    }
  }, [open]);

  // Lightweight focus trap inside the dialog. Tab cycles, Shift+Tab cycles back.
  const onKeyDownTrap = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('aria-hidden'));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    const trimmedNextStep = nextStep.trim();
    const input: NewApplicationInput = {
      company: company.trim(),
      role: role.trim(),
      status,
    };
    const low = parseNumber(compLow);
    const high = parseNumber(compHigh);
    if (low != null) input.comp_low = low;
    if (high != null) input.comp_high = high;
    const trimmedLocation = location.trim();
    if (trimmedLocation) input.location = trimmedLocation;
    if (remote !== 'unspecified') input.remote = remote;
    if (trimmedNextStep) input.next_step = trimmedNextStep;
    if (due) input.next_step_due = due;
    if (status === 'applied') input.applied = todayIso();
    const parsedTags = parseTags(tags);
    if (parsedTags.length > 0) input.tags = parsedTags;

    const result = await createApplication(input);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    setSubmitting(false);
    setSelection({ kind: 'application', id: result.application.slug });
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center p-4 pt-24 overflow-y-auto"
      onMouseDown={handleBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={onKeyDownTrap}
        className="bg-neutral-50 w-full max-w-md rounded-xl shadow-xl border border-neutral-200 overflow-hidden"
      >
        <header className="px-6 pt-6 pb-3">
          <h2
            id={headingId}
            className="font-display text-2xl text-neutral-900"
          >
            Track a new application
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            For full resume + cover letter generation, run{' '}
            <code className="text-neutral-700">/apply</code> in Claude Code instead.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <Field label="Company" required htmlFor="new-app-company">
            <input
              id="new-app-company"
              ref={firstFieldRef}
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Role" required htmlFor="new-app-role">
            <input
              id="new-app-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Status" htmlFor="new-app-status">
            <select
              id="new-app-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="border-0 p-0 m-0">
            <legend className="text-sm text-neutral-600 mb-1">Comp band</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-neutral-500">Low</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={compLow}
                  onChange={(e) => setCompLow(e.target.value)}
                  placeholder="100000"
                  aria-label="Comp low"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">High</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={compHigh}
                  onChange={(e) => setCompHigh(e.target.value)}
                  placeholder="120000"
                  aria-label="Comp high"
                  className={inputClass}
                />
              </label>
            </div>
          </fieldset>

          <Field label="Location" htmlFor="new-app-location">
            <input
              id="new-app-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Boston, MA"
              className={inputClass}
            />
          </Field>

          <Field label="Remote" htmlFor="new-app-remote">
            <select
              id="new-app-remote"
              value={remote}
              onChange={(e) => setRemote(e.target.value as Remote)}
              className={inputClass}
            >
              {REMOTE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Next step" htmlFor="new-app-next-step">
            <input
              id="new-app-next-step"
              type="text"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Submit application"
              className={inputClass}
            />
          </Field>

          <Field label="Due" htmlFor="new-app-due">
            <input
              id="new-app-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Tags" htmlFor="new-app-tags">
            <input
              id="new-app-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated"
              className={inputClass}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-neutral-600 hover:text-neutral-900 px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="text-sm font-medium px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:border-neutral-300';

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-sm text-neutral-600">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
