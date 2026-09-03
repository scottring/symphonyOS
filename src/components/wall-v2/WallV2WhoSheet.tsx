// The "who's on?" sheet. One card per open handoff — "Who's walking Ella &
// Kaleb to school? · Tomorrow 7:15a" — and the adults' faces under it. One
// tap answers, and the answer sticks to that day. Nothing to type, nothing to
// scroll: two parents, a handful of questions at most.

import { useState } from 'react';
import { X } from 'lucide-react';
import { WALL, personAccent } from './wallTheme';
import type { HandoffQuestion } from './wallQuestions';
import type { FamilyMember } from '@/types/family';

interface Props {
  questions: HandoffQuestion[];
  adults: FamilyMember[];
  /** Index of each adult in the board's roster, for the matching accent. */
  accentIndex: (memberId: string) => number;
  onPick: (question: HandoffQuestion, member: FamilyMember) => void;
  onClose: () => void;
}

function FaceButton({ member, index, onTap }: { member: FamilyMember; index: number; onTap: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={member.name}
      className={`${WALL.card} border-l-4 ${personAccent(index)} flex items-center gap-4 px-5 min-h-[88px] min-w-[220px] text-left active:scale-[.97] transition-transform`}
    >
      {failed ? (
        <span className="w-14 h-14 rounded-xl grid place-items-center bg-[#F4E5CA] dark:bg-[#4A3D28] font-display text-[1.6rem] text-[#6E5A3A] dark:text-[#D8BC85]">
          {member.name.charAt(0)}
        </span>
      ) : (
        <img
          src={`/wall/portrait-${member.id}.png`}
          alt=""
          onError={() => setFailed(true)}
          className="w-14 h-14 rounded-xl object-cover border-2 border-[#EEE1C7] dark:border-[#4A3D28]"
        />
      )}
      <span className={`font-display text-[1.5rem] ${WALL.inkStrong}`}>{member.name}</span>
    </button>
  );
}

export function WallV2WhoSheet({ questions, adults, accentIndex, onPick, onClose }: Props) {
  return (
    <div className={`fixed inset-0 z-50 ${WALL.root} flex flex-col`} role="dialog" aria-label="Who's on?">
      <div className="flex items-center justify-between px-8 pt-8 pb-4">
        <div>
          <h1 className={`font-display text-[2rem] font-bold leading-tight ${WALL.inkStrong}`}>Who's on?</h1>
          <div className={WALL.label}>Tap a face. It sticks to that day.</div>
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

      <div className="flex-1 min-h-0 px-8 pb-8 flex flex-col gap-4">
        {questions.length === 0 ? (
          <div className="flex-1 grid place-items-center">
            <p className={`text-[1.3rem] font-semibold ${WALL.muted}`}>Nothing open. Everyone's covered.</p>
          </div>
        ) : (
          questions.map((q) => (
            <div key={q.itemId} className={`${WALL.card} p-5 flex flex-col gap-4`}>
              <div>
                <div className={`${WALL.label} text-[#A8600F] dark:text-[#E0A959]`}>
                  {q.when === 'today' ? 'Today' : 'Tomorrow'} · {q.time}
                </div>
                <div className={`font-display text-[1.5rem] leading-snug ${WALL.inkStrong}`}>{q.prompt}</div>
              </div>
              <div className="flex flex-wrap gap-4">
                {adults.map((a) => (
                  <FaceButton key={a.id} member={a} index={accentIndex(a.id)} onTap={() => onPick(q, a)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
