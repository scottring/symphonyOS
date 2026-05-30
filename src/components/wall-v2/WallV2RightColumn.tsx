// src/components/wall-v2/WallV2RightColumn.tsx
//
// Stacks the right-column widgets in their fixed order. Weather lives in the
// left date column, so this rail stays focused on grocery, upcoming events,
// and the family's "tonight's question" prompt.

import { WallV2GroceryCard } from './WallV2GroceryCard';
import { WallV2UpcomingCard } from './WallV2UpcomingCard';
import { WallV2QuestionCard } from './WallV2QuestionCard';
import { useDragScroll } from '@/hooks/useDragScroll';
import type {
  WallV2GroceryData,
  WallV2UpcomingItem,
} from './types';

interface Props {
  grocery: WallV2GroceryData;
  upcoming: WallV2UpcomingItem[];
  question: string | null;
  onTapGrocery?: () => void;
  onTapQuestion?: () => void;
}

export function WallV2RightColumn({
  grocery, upcoming, question, onTapGrocery, onTapQuestion,
}: Props) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  return (
    <div ref={scrollRef} className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto pr-1 -mr-1">
      <WallV2GroceryCard data={grocery} onTap={onTapGrocery} />
      <WallV2UpcomingCard items={upcoming} />
      <WallV2QuestionCard question={question} onTap={onTapQuestion} />
    </div>
  );
}
