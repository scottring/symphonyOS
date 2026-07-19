import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipboardList } from 'lucide-react';
import { WallV2KeepMoving } from './WallV2KeepMoving';
import type { WallV2TimelineEvent } from './types';

const task = (id: string, title: string): WallV2TimelineEvent => ({
  id, title, icon: ClipboardList, tint: 'sage', kind: 'task', completed: false,
});

describe('WallV2KeepMoving', () => {
  it('renders the label and one row per task', () => {
    render(<WallV2KeepMoving tasks={[task('task-1', 'Grocery pickup'), task('task-2', 'Science fair materials')]} onToggleComplete={() => {}} onTapTask={() => {}} />);
    expect(screen.getByText('Keep moving')).toBeInTheDocument();
    expect(screen.getByText('Grocery pickup')).toBeInTheDocument();
    expect(screen.getByText('Science fair materials')).toBeInTheDocument();
  });
  it('checkbox toggles completion; row tap opens the task', () => {
    const onToggle = vi.fn(); const onTap = vi.fn();
    render(<WallV2KeepMoving tasks={[task('task-1', 'Grocery pickup')]} onToggleComplete={onToggle} onTapTask={onTap} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /grocery pickup/i }));
    expect(onToggle).toHaveBeenCalledWith('task-1', true);
    fireEvent.click(screen.getByText('Grocery pickup'));
    expect(onTap).toHaveBeenCalledWith('task-1');
  });
  it('renders empty state when no tasks', () => {
    render(<WallV2KeepMoving tasks={[]} onToggleComplete={() => {}} onTapTask={() => {}} />);
    expect(screen.getByText(/nothing pressing/i)).toBeInTheDocument();
  });
  it('completed task shows line-through styling', () => {
    const completedTask: WallV2TimelineEvent = {
      id: 'task-1', title: 'Completed task', icon: ClipboardList, tint: 'sage', kind: 'task', completed: true,
    };
    const { container } = render(<WallV2KeepMoving tasks={[completedTask]} onToggleComplete={() => {}} onTapTask={() => {}} />);
    const titleButton = screen.getByText('Completed task');
    expect(titleButton).toHaveClass('line-through');
    expect(container).toBeInTheDocument();
  });
});
