import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2FamilyStrip } from './WallV2FamilyStrip';
import type { FamilyMember } from '@/types/family';

const members = [
  { id: 'm1', name: 'Scott' }, { id: 'm2', name: 'Iris' },
] as FamilyMember[];

describe('WallV2FamilyStrip', () => {
  it('renders one card per member with monogram fallback and all-clear line', () => {
    render(<WallV2FamilyStrip familyMembers={members} today={undefined} now={new Date()} onDockAction={() => {}} hideDailyRoutines={false} />);
    expect(screen.getByText('Scott')).toBeInTheDocument();
    expect(screen.getByText('Iris')).toBeInTheDocument();
    expect(screen.getAllByText(/all clear today/i)).toHaveLength(2);
    // portraits attempt the naming convention
    expect(screen.getByAltText('Scott')).toHaveAttribute('src', '/wall/portrait-m1.png');
  });
  it('fires dock actions', () => {
    const onDock = vi.fn();
    render(<WallV2FamilyStrip familyMembers={members} today={undefined} now={new Date()} onDockAction={onDock} hideDailyRoutines={false} />);
    fireEvent.click(screen.getByLabelText('Add a task'));
    expect(onDock).toHaveBeenCalledWith('task');
    fireEvent.click(screen.getByLabelText('Utilities'));
    expect(onDock).toHaveBeenCalledWith('utilities');
  });
  it('shows monogram medallion when portrait fails to load', () => {
    render(<WallV2FamilyStrip familyMembers={members} today={undefined} now={new Date()} onDockAction={() => {}} hideDailyRoutines={false} />);
    const scottPortrait = screen.getByAltText('Scott');
    fireEvent.error(scottPortrait);
    // After error, monogram should appear
    expect(screen.getByText('S')).toBeInTheDocument();
    // Portrait img should be gone
    expect(screen.queryByAltText('Scott')).not.toBeInTheDocument();
  });
  it('fires the list dock action', () => {
    const onDockAction = vi.fn();
    render(
      <WallV2FamilyStrip
        familyMembers={[]}
        today={undefined}
        now={new Date('2026-08-02T12:00:00')}
        onDockAction={onDockAction}
        hideDailyRoutines={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /lists/i }));
    expect(onDockAction).toHaveBeenCalledWith('list');
  });
});
