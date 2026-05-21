// src/components/wall-v2/WallV2QuestionCard.tsx
//
// Tonight's Question — the daily family conversation prompt that lived in
// wall-v1's NowCard. Sits in the right column to spark dinnertime / bedtime
// discussion. Pulls from useDailyDiscussionPrompt via the shell.

import { MessageCircle, Sparkles } from 'lucide-react';

interface Props {
  question: string | null;
  onTap?: () => void;
}

export function WallV2QuestionCard({ question, onTap }: Props) {
  const tappable = Boolean(onTap && question);

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!tappable}
      className="group relative w-full text-left bg-gradient-to-br from-violet-50 to-rose-50 dark:from-violet-900/30 dark:to-rose-900/30 border border-violet-200/70 dark:border-violet-700/60 rounded-2xl p-4 overflow-hidden transition-colors hover:from-violet-100 hover:to-rose-100 dark:hover:from-violet-900/50 dark:hover:to-rose-900/50 disabled:cursor-default disabled:hover:from-violet-50 disabled:hover:to-rose-50 dark:disabled:hover:from-violet-900/30 dark:disabled:hover:to-rose-900/30"
    >
      <div className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300 mb-2">
        <MessageCircle className="w-4 h-4" />
        Tonight's question
      </div>
      {question ? (
        <p className="font-display italic text-[1.1rem] leading-snug text-stone-800 dark:text-stone-100">
          &ldquo;{question}&rdquo;
        </p>
      ) : (
        <p className="text-[0.9rem] text-stone-500 dark:text-stone-400">
          No question today.
        </p>
      )}
      <Sparkles className="absolute top-2 right-2 w-9 h-9 text-violet-200/80 dark:text-violet-700/40 rotate-12" aria-hidden />
    </button>
  );
}
