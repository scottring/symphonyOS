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

  describe('day arrows', () => {
    it('shows no arrows when the shell passes no day handlers', () => {
      render(<WallV2DinnerCard mealName="Tacos" dinnerStart={null} onTap={() => {}} />);
      expect(screen.queryByRole('button', { name: 'Previous day' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next day' })).not.toBeInTheDocument();
    });

    it('pages back and forward', () => {
      const onPrevDay = vi.fn();
      const onNextDay = vi.fn();
      render(
        <WallV2DinnerCard mealName="Tacos" dinnerStart={null} onTap={() => {}}
          onPrevDay={onPrevDay} onNextDay={onNextDay} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
      fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
      expect(onPrevDay).toHaveBeenCalledTimes(1);
      expect(onNextDay).toHaveBeenCalledTimes(1);
    });

    it('keeps the arrow in place but disabled at the end of the plan, so the card never resizes', () => {
      render(
        <WallV2DinnerCard mealName="Tacos" dinnerStart={null} onTap={() => {}}
          onPrevDay={() => {}} onNextDay={null} />,
      );
      expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled();
    });

    it('names the day instead of "Dinner plan" once paged off today', () => {
      render(
        <WallV2DinnerCard mealName="Fish Tacos" dinnerStart={null} onTap={() => {}}
          dayLabel="Thu, Aug 6" onPrevDay={() => {}} onNextDay={() => {}} />,
      );
      expect(screen.getByText('Thu, Aug 6')).toBeInTheDocument();
      expect(screen.queryByText('Dinner plan')).not.toBeInTheDocument();
    });

    it('drops the prep window on another day — it counts down against tonight only', () => {
      const start = new Date(2026, 6, 19, 17, 30);
      const { rerender } = render(
        <WallV2DinnerCard mealName="Grilled Salmon" dinnerStart={start} onTap={() => {}} />,
      );
      expect(screen.getByText(/4:45 – 5:30/)).toBeInTheDocument();

      rerender(
        <WallV2DinnerCard mealName="Fish Tacos" dinnerStart={start} onTap={() => {}}
          dayLabel="Thu, Aug 6" onPrevDay={() => {}} onNextDay={() => {}} />,
      );
      expect(screen.queryByText(/Prep window/)).not.toBeInTheDocument();
    });

    it('opens the recipe from the meal name without the arrows swallowing the tap', () => {
      const onTap = vi.fn();
      const onNextDay = vi.fn();
      render(
        <WallV2DinnerCard mealName="Tacos" dinnerStart={null} onTap={onTap}
          onPrevDay={() => {}} onNextDay={onNextDay} />,
      );
      fireEvent.click(screen.getByText('Tacos'));
      expect(onTap).toHaveBeenCalledTimes(1);
      expect(onNextDay).not.toHaveBeenCalled();
    });
  });
});
