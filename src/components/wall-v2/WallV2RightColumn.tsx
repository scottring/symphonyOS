// src/components/wall-v2/WallV2RightColumn.tsx
//
// Stacks the four right-column widgets in their fixed order. Each card sets
// its own padding; the column just spaces them and lets the column flex to
// match the timeline height.

import { WallV2WeatherCard } from './WallV2WeatherCard';
import { WallV2GroceryCard } from './WallV2GroceryCard';
import { WallV2UpcomingCard } from './WallV2UpcomingCard';
import { WallV2InsightCard } from './WallV2InsightCard';
import type {
  WallV2GroceryData,
  WallV2InsightData,
  WallV2UpcomingItem,
  WallV2WeatherData,
} from './types';

interface Props {
  weather: WallV2WeatherData;
  grocery: WallV2GroceryData;
  upcoming: WallV2UpcomingItem[];
  insight: WallV2InsightData;
  onTapGrocery?: () => void;
  onTapInsight?: () => void;
}

export function WallV2RightColumn({
  weather, grocery, upcoming, insight, onTapGrocery, onTapInsight,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <WallV2WeatherCard data={weather} />
      <WallV2GroceryCard data={grocery} onTap={onTapGrocery} />
      <WallV2UpcomingCard items={upcoming} />
      <WallV2InsightCard data={insight} onTap={onTapInsight} />
    </div>
  );
}
