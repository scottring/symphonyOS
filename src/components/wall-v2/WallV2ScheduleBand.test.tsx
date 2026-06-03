import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { WallV2ScheduleBand } from './WallV2ScheduleBand';
import type { WallV2ScheduleBandData } from './types';

describe('WallV2ScheduleBand', () => {
  it('renders the empty placeholder when there are no commitments', () => {
    const band: WallV2ScheduleBandData = { allDay: [], timed: [] };
    render(<WallV2ScheduleBand band={band} />);
    expect(screen.getByText('No appointments today')).toBeInTheDocument();
  });

  it('renders timed rows with their time gutter', () => {
    const band: WallV2ScheduleBandData = {
      allDay: [],
      timed: [{ id: 'event-1', icon: Calendar, tint: 'sage', title: 'Dentist', time: '2:00 PM' }],
    };
    render(<WallV2ScheduleBand band={band} />);
    expect(screen.getByText('Dentist')).toBeInTheDocument();
    expect(screen.getByText('2:00 PM')).toBeInTheDocument();
  });
});
