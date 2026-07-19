// src/components/wall-v2/WallV2QuestionCard.tsx
//
// Tonight's Question — the daily family conversation prompt that lived in
// wall-v1's NowCard. Sits in the right column to spark dinnertime / bedtime
// discussion. Pulls from useDailyDiscussionPrompt via the shell.

import { MessageCircle, Sparkles } from 'lucide-react';
import { WALL } from './wallTheme';

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
      style={{ touchAction: 'pan-y' }}
      className={`group relative w-full min-h-[48px] text-left ${WALL.card} px-4 py-3 overflow-hidden transition-colors disabled:cursor-default`}
    >
      <div className={`flex items-center gap-2 mb-2 ${WALL.label}`}>
        <MessageCircle className="w-4 h-4" />
        Tonight's question
      </div>
      {question ? (
        <p className={`font-display italic text-[1.1rem] leading-snug ${WALL.ink}`}>
          &ldquo;{question}&rdquo;
        </p>
      ) : (
        <p className={`text-[0.9rem] ${WALL.ink}`}>
          No question today.
        </p>
      )}
      <Sparkles className="absolute top-2 right-2 w-9 h-9 text-violet-200/80 dark:text-violet-700/40 rotate-12" aria-hidden />
    </button>
  );
}
