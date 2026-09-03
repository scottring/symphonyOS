// Tonight's question, full screen. The strip card is a hundred pixels wide;
// the question is meant to be read aloud at the table, so a tap opens it in
// type the whole kitchen can read. Nothing here happens by accident: the
// question goes away only when someone says "Done for tonight".

import { MessageCircle, X } from 'lucide-react';
import { WALL } from './wallTheme';

interface Props {
  question: string;
  dismissed: boolean;
  onNext: () => void;
  onDone: () => void;
  onBringBack: () => void;
  onClose: () => void;
}

export function WallV2QuestionSheet({ question, dismissed, onNext, onDone, onBringBack, onClose }: Props) {
  return (
    <div className={`fixed inset-0 z-50 ${WALL.root} flex flex-col`} role="dialog" aria-label="Tonight's question">
      <div className="flex items-center justify-between px-8 pt-8 pb-4">
        <div className={`${WALL.label} flex items-center gap-2`}>
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          Tonight's question
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`${WALL.card} grid place-items-center w-14 h-14 shrink-0`}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0 px-12 flex items-center">
        <p className={`font-display italic text-[3rem] leading-tight ${WALL.inkStrong}`}>
          &ldquo;{question}&rdquo;
        </p>
      </div>

      <div className="px-8 pb-8 flex gap-4">
        <button
          type="button"
          onClick={onNext}
          className={`${WALL.card} flex-1 min-h-[80px] font-bold text-[1.2rem] active:scale-[.98] transition-transform`}
        >
          Another question
        </button>
        {dismissed ? (
          <button
            type="button"
            onClick={onBringBack}
            className={`${WALL.card} flex-1 min-h-[80px] font-bold text-[1.2rem] active:scale-[.98] transition-transform`}
          >
            Bring it back
          </button>
        ) : (
          <button
            type="button"
            onClick={onDone}
            className="flex-1 min-h-[80px] rounded-2xl font-bold text-[1.2rem] bg-[#2E4638] dark:bg-[#4E7261] text-white active:scale-[.98] transition-transform"
          >
            Done for tonight
          </button>
        )}
      </div>
    </div>
  );
}
