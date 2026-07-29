import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WallV2FreshnessLine } from './WallV2FreshnessLine';
import { WallV2StaleBanner } from './WallV2StaleBanner';
import type { Freshness } from './wallFreshness';

const fresh: Freshness = { level: 'fresh', label: 'Updated 5:53 PM', minutesStale: 1 };
const stale: Freshness = { level: 'stale', label: 'Updated 2:14 PM', minutesStale: 39 };
const critical: Freshness = { level: 'critical', label: 'Updated 2:14 PM', minutesStale: 219 };

describe('WallV2FreshnessLine', () => {
  it('shows the last-updated time when data is fresh', () => {
    render(<WallV2FreshnessLine freshness={fresh} />);
    expect(screen.getByText('Updated 5:53 PM')).toBeInTheDocument();
  });

  it('is always visible, because a missing warning must not imply freshness', () => {
    render(<WallV2FreshnessLine freshness={fresh} />);
    expect(screen.getByTestId('wall-freshness')).toHaveAttribute('data-level', 'fresh');
  });

  it('marks itself stale so the rail can warn without a banner', () => {
    render(<WallV2FreshnessLine freshness={stale} />);
    expect(screen.getByTestId('wall-freshness')).toHaveAttribute('data-level', 'stale');
    expect(screen.getByText('Updated 2:14 PM')).toBeInTheDocument();
  });
});

describe('WallV2StaleBanner', () => {
  it('stays out of the way while data is fresh', () => {
    render(<WallV2StaleBanner freshness={fresh} />);
    expect(screen.queryByTestId('wall-stale-banner')).not.toBeInTheDocument();
  });

  it('does not take over the wall for merely stale data', () => {
    render(<WallV2StaleBanner freshness={stale} />);
    expect(screen.queryByTestId('wall-stale-banner')).not.toBeInTheDocument();
  });

  it('takes over the top of the wall once the data is critically old', () => {
    render(<WallV2StaleBanner freshness={critical} />);
    expect(screen.getByTestId('wall-stale-banner')).toBeInTheDocument();
    expect(screen.getByText(/Can't reach Symphony/i)).toBeInTheDocument();
  });

  it('names the time the shown data actually came from', () => {
    render(<WallV2StaleBanner freshness={critical} />);
    expect(screen.getByText(/2:14 PM/)).toBeInTheDocument();
  });
});
