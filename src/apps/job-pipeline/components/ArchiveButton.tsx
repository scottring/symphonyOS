// src/apps/job-pipeline/components/ArchiveButton.tsx
import { useState } from 'react';

interface Props {
  archived: boolean;
  onToggle: (archived: boolean) => Promise<{ ok: boolean; error?: string }>;
}

export function ArchiveButton({ archived, onToggle }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    const result = await onToggle(!archived);
    setPending(false);
    if (!result.ok && result.error) setError(result.error);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="text-sm text-neutral-700 underline disabled:opacity-50"
      >
        {archived ? 'Restore' : 'Archive'}
      </button>
      {error && <span className="text-xs text-accent-500">{error}</span>}
    </div>
  );
}
