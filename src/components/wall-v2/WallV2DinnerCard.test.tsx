import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2DinnerCard } from './WallV2DinnerCard';

describe('WallV2DinnerCard', () => {
  it('renders meal name, subtitle, and prep window from dinner start', () => {
    render(<WallV2DinnerCard mealName="Grilled Salmon" subtitle="with couscous & roasted vegetables" dinnerStart={new Date(2026, 6, 19, 17, 30)} onTap={() => {}} />);
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
    expect(screen.getByText(/couscous/)).toBeInTheDocument();
    expect(screen.getByText(/4:45 – 5:30/)).toBeInTheDocument();
  });
  it('fires onTap when tapped', () => {
    const onTap = vi.fn();
    render(<WallV2DinnerCard mealName="Tacos" dinnerStart={null} onTap={onTap} />);
    fireEvent.click(screen.getByText('Tacos'));
    expect(onTap).toHaveBeenCalled();
  });
  it('renders quiet empty state when no dinner is planned', () => {
    render(<WallV2DinnerCard mealName={null} dinnerStart={null} />);
    expect(screen.getByText(/no dinner planned/i)).toBeInTheDocument();
  });
});
