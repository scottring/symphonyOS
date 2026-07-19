// src/components/wall-v2/WallV2RightColumn.tsx
//
// Right column: dinner hero, tomorrow-morning preview, at-a-glance rollup,
// tonight's question. Drag-scrolls when content exceeds the column.
// Phase 2 reserves the slot ABOVE the dinner card for "Symphony Noticed".

import { useDragScroll } from '@/hooks/useDragScroll';
import { WallV2DinnerCard } from './WallV2DinnerCard';
import { WallV2TomorrowCard } from './WallV2TomorrowCard';
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
  };
  tomorrowRows: { id: string; time: string; title: string }[];
  glanceRows: GlanceRollupRow[];
  question: string | null;
  onTapQuestion?: () => void;
}

export function WallV2RightColumn({ dinner, tomorrowRows, glanceRows, question, onTapQuestion }: Props) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  return (
    <div ref={scrollRef} className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto pr-1 -mr-1">
      <WallV2DinnerCard
        mealName={dinner.mealName}
        subtitle={dinner.subtitle}
        dinnerStart={dinner.dinnerStart}
        photoUrl={dinner.photoUrl}
        onTap={dinner.onTap}
      />
      <WallV2TomorrowCard rows={tomorrowRows} />
      <WallV2GlanceRollupCard rows={glanceRows} />
      {question && <WallV2QuestionCard question={question} onTap={onTapQuestion} />}
    </div>
  );
}
