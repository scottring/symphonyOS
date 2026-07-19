// src/components/wall-v2/WallV2RightColumn.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WallV2RightColumn } from './WallV2RightColumn';

const baseProps = {
  dinner: { mealName: 'Grilled Salmon', subtitle: null, dinnerStart: new Date(2026, 6, 19, 17, 30), photoUrl: null, onTap: () => {} },
  tomorrowRows: [{ id: 'a', time: '7:00', title: 'Breakfast & pack lunches' }],
  glanceRows: [
    { id: 'events', icon: 'calendar' as const, text: '2 events today — next: Swim at 10:30' },
    { id: 'home', icon: 'home' as const, text: 'Everyone home tonight' },
  ],
  question: 'What made you laugh today?',
  onTapQuestion: () => {},
};

describe('WallV2RightColumn', () => {
  it('stacks dinner, tomorrow, at-a-glance, and question', () => {
    render(<WallV2RightColumn {...baseProps} />);
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow morning')).toBeInTheDocument();
    expect(screen.getByText(/pack lunches/)).toBeInTheDocument();
    expect(screen.getByText('Everyone home tonight')).toBeInTheDocument();
    expect(screen.getByText(/laugh today/)).toBeInTheDocument();
  });
  it('hides tomorrow card when empty and question when null', () => {
    render(<WallV2RightColumn {...baseProps} tomorrowRows={[]} question={null} />);
    expect(screen.queryByText('Tomorrow morning')).not.toBeInTheDocument();
    expect(screen.queryByText(/laugh today/)).not.toBeInTheDocument();
  });
});
