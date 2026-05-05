// src/apps/job-pipeline/components/AddToTodayButton.tsx
//
// Push the apply file's `next_step` into Symphony's task list, scheduled for
// today, in the work domain. Uses the existing useSupabaseTasks hook so the
// Today view picks it up via the same realtime channel as native task creates.
import { useState } from 'react';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';

interface Props {
  slug: string;
  filename: string;
  company: string;
  next_step: string;
}

function obsidianUrl(filename: string): string {
  return `obsidian://open?vault=scotts-world&file=${encodeURIComponent('tasks/' + filename)}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function AddToTodayButton({ slug, filename, company, next_step }: Props) {
  const { addTask, updateTask } = useSupabaseTasks();
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    const title = `${next_step} — ${company}`;
    const notes = `From job pipeline (slug: ${slug})\n\n${obsidianUrl(filename)}`;
    const id = await addTask(title, undefined, undefined, startOfToday(), {
      context: 'work',
      category: 'task',
    });
    if (id) {
      // addTask doesn't support notes inline; set them in a follow-up update so
      // the apply file's slug + obsidian backlink is preserved on the task.
      await updateTask(id, { notes });
      setAdded(true);
    } else {
      setError('Failed to add task. Check that you are signed in.');
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending || added}
        onClick={handleClick}
        className="text-sm rounded-md border border-neutral-200 bg-white px-3 py-1 text-neutral-900 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-default"
      >
        {added ? 'Added to Today' : 'Add as task today'}
      </button>
      {error && <span className="text-xs text-accent-500">{error}</span>}
    </div>
  );
}
