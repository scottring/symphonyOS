// src/components/wall-v2/WallV2RightColumn.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WallV2RightColumn } from './WallV2RightColumn';
import type { MealRow } from './wallStrip';

const mealRows: MealRow[] = [
  { dateKey: '2026-08-23', dayLabel: 'Today', title: 'Grilled Salmon', isToday: true, isGap: false },
  { dateKey: '2026-08-24', dayLabel: 'Mon', title: null, isToday: false, isGap: true },
  { dateKey: '2026-08-25', dayLabel: 'Tue', title: 'Taco night', isToday: false, isGap: false },
];

const baseProps = {
  dinner: { mealName: 'Grilled Salmon', subtitle: null, dinnerStart: new Date(2026, 6, 19, 17, 30), photoUrl: null, onTap: () => {} },
  mealRows,
  glanceRows: [
    { id: 'events', icon: 'calendar' as const, text: '2 events today — next: Swim at 10:30' },
    { id: 'home', icon: 'home' as const, text: 'Everyone home tonight' },
  ],
  question: 'What made you laugh today?',
  onTapQuestion: () => {},
};

describe('WallV2RightColumn', () => {
  it('stacks dinner, the week of dinners, at-a-glance, and question', () => {
    render(<WallV2RightColumn {...baseProps} />);
    // The hero says TONIGHT; the meals card says the rest of the week. Both
    // name the same dish today, which is why the hero is the only one that
    // renders it large.
    expect(screen.getAllByText('Grilled Salmon').length).toBeGreaterThan(0);
    expect(screen.getByText('Dinners')).toBeInTheDocument();
    expect(screen.getByText('Taco night')).toBeInTheDocument();
    expect(screen.getByText('Everyone home tonight')).toBeInTheDocument();
    expect(screen.getByText(/laugh today/)).toBeInTheDocument();
  });

  it('names an unplanned night instead of leaving the row blank', () => {
    render(<WallV2RightColumn {...baseProps} />);
    expect(screen.getByText('Nothing planned')).toBeInTheDocument();
  });

  it('hides the question when null, and still shows the meals card empty-state', () => {
    render(<WallV2RightColumn {...baseProps} mealRows={[]} question={null} />);
    expect(screen.queryByText(/laugh today/)).not.toBeInTheDocument();
    expect(screen.getByText('No meal plan yet')).toBeInTheDocument();
  });
});
