// src/components/wall-v2/WallV2RightColumn.tsx
//
// Right column: dinner hero, the week's dinners, at-a-glance rollup,
// tonight's question. Drag-scrolls when content exceeds the column.
//
// The tomorrow-morning preview that used to sit here was fed a hardcoded
// empty array by the only caller, so it has been rendering nothing since it
// was written. The week-of-dinners card takes the slot and actually earns it:
// it is the one surface that can say a night has NO plan.
// Phase 2 reserves the slot ABOVE the dinner card for "Symphony Noticed".

import type { ReactNode } from 'react';
import { useDragScroll } from '@/hooks/useDragScroll';
import { WallV2DinnerCard } from './WallV2DinnerCard';
import { WallV2MealsCard } from './WallV2Strip';
import type { MealRow } from './wallStrip';
import { WallV2GlanceRollupCard } from './WallV2GlanceRollupCard';
import { WallV2QuestionCard } from './WallV2QuestionCard';
import type { GlanceRollupRow } from './wallV2Rollups';

interface Props {
  dinner: {
    mealName: string | null;
    subtitle?: string | null;
    dinnerStart: Date | null;
    photoUrl?: string | null;
    onTap?: () => void;
    /** Set only when the card is showing a day other than today. */
    dayLabel?: string | null;
    onPrevDay?: (() => void) | null;
    onNextDay?: (() => void) | null;
  };
  /** The week of dinners, gaps called out. Complements the hero above it. */
  mealRows: MealRow[];
  glanceRows: GlanceRollupRow[];
  question: string | null;
  onTapQuestion?: () => void;
  /** Pinned list cards, rendered below the dinner card. Empty when nothing is pinned. */
  pinnedLists?: ReactNode;
}

export function WallV2RightColumn({ dinner, mealRows, glanceRows, question, onTapQuestion, pinnedLists }: Props) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  return (
    <div ref={scrollRef} className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto pr-1 -mr-1">
      <WallV2DinnerCard
        mealName={dinner.mealName}
        subtitle={dinner.subtitle}
        dinnerStart={dinner.dinnerStart}
        photoUrl={dinner.photoUrl}
        onTap={dinner.onTap}
        dayLabel={dinner.dayLabel}
        onPrevDay={dinner.onPrevDay}
        onNextDay={dinner.onNextDay}
      />
      {pinnedLists}
      <WallV2MealsCard rows={mealRows} />
      <WallV2GlanceRollupCard rows={glanceRows} />
      {question && <WallV2QuestionCard question={question} onTap={onTapQuestion} />}
    </div>
  );
}
