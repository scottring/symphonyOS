import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2UtilitySheet } from './WallV2UtilitySheet';

const props = () => ({
  hideRoutines: false, isDark: false, refreshing: false,
  onGuestMode: vi.fn(), onRefresh: vi.fn(), onToggleHideRoutines: vi.fn(),
  onToggleTheme: vi.fn(), onClose: vi.fn(),
});

describe('WallV2UtilitySheet', () => {
  it('renders all four utilities and fires their callbacks', () => {
    const p = props();
    render(<WallV2UtilitySheet {...p} />);
    fireEvent.click(screen.getByText('Guest mode'));
    expect(p.onGuestMode).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Refresh'));
    expect(p.onRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/hide daily routines/i));
    expect(p.onToggleHideRoutines).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/night theme/i));
    expect(p.onToggleTheme).toHaveBeenCalled();
  });
  it('closes on scrim tap', () => {
    const p = props();
    render(<WallV2UtilitySheet {...p} />);
    fireEvent.click(screen.getByTestId('utility-scrim'));
    expect(p.onClose).toHaveBeenCalled();
  });
  it('labels flip with state', () => {
    const p = { ...props(), hideRoutines: true, isDark: true };
    render(<WallV2UtilitySheet {...p} />);
    expect(screen.getByText(/show daily routines/i)).toBeInTheDocument();
    expect(screen.getByText(/day theme/i)).toBeInTheDocument();
  });
  it('RefreshCw icon spins when refreshing', () => {
    const p = props();
    const { rerender } = render(<WallV2UtilitySheet {...p} />);
    const refreshButton = screen.getByText('Refresh').closest('button');
    const icon = refreshButton?.querySelector('svg');
    expect(icon?.getAttribute('class')).not.toContain('animate-spin');
    rerender(<WallV2UtilitySheet {...p} refreshing={true} />);
    const updatedIcon = refreshButton?.querySelector('svg');
    expect(updatedIcon?.getAttribute('class')).toContain('animate-spin');
  });
});
