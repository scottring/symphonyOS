import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sun } from 'lucide-react';
import { WallV2DateColumn } from './WallV2DateColumn';

const props = {
  weekday: 'Saturday', fullDate: 'July 19, 2026', time: '10:04 AM',
  date: new Date(2026, 6, 19),
  weatherIcon: Sun, weatherTint: { bg: 'bg-amber-50', fg: 'text-amber-700' },
  temp: 72, condition: 'Partly cloudy', high: 77, low: 60,
  freshness: { level: 'fresh' as const, label: 'Updated 10:04 AM', minutesStale: 0 },
};

describe('WallV2DateColumn', () => {
  it('renders date, clock, weather, tagline, and a quote with author', () => {
    render(<WallV2DateColumn {...props} />);
    expect(screen.getByText('Saturday')).toBeInTheDocument();
    expect(screen.getByText('10:04 AM')).toBeInTheDocument();
    expect(screen.getByText('72°')).toBeInTheDocument();
    expect(screen.getByText(/shape of your day/i)).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument(); // quote author line
  });

  it('carries the freshness line, so the rail always states how current it is', () => {
    render(<WallV2DateColumn {...props} />);
    expect(screen.getByText('Updated 10:04 AM')).toBeInTheDocument();
  });
});
