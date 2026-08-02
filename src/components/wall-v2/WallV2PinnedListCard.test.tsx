import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2PinnedListCard } from './WallV2PinnedListCard';
import type { ListItem } from '@/types/list';

function item(id: string, text: string): ListItem {
  return {
    id,
    listId: 'list-1',
    text,
    sortOrder: 0,
    completed: false,
    createdAt: new Date('2026-08-02T12:00:00Z'),
    updatedAt: new Date('2026-08-02T12:00:00Z'),
  };
}

const props = (openItems: ListItem[]) => ({
  title: 'Groceries',
  openItems,
  loading: false,
  onToggle: vi.fn(),
  onOpen: vi.fn(),
});

describe('WallV2PinnedListCard', () => {
  it('renders the title and the open count', () => {
    render(<WallV2PinnedListCard {...props([item('1', 'Milk')])} />);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('caps at five rows and shows the overflow count', () => {
    const seven = Array.from({ length: 7 }, (_, i) => item(String(i), `Item ${i}`));
    render(<WallV2PinnedListCard {...props(seven)} />);
    expect(screen.getByText('Item 4')).toBeInTheDocument();
    expect(screen.queryByText('Item 5')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('tapping a row checks that item off', () => {
    const p = props([item('abc', 'Milk')]);
    render(<WallV2PinnedListCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /check off milk/i }));
    expect(p.onToggle).toHaveBeenCalledWith('abc');
  });

  it('tapping the header opens the sheet', () => {
    const p = props([item('1', 'Milk')]);
    render(<WallV2PinnedListCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /open groceries/i }));
    expect(p.onOpen).toHaveBeenCalled();
  });

  it('tapping the overflow line opens the sheet', () => {
    const p = props(Array.from({ length: 7 }, (_, i) => item(String(i), `Item ${i}`)));
    render(<WallV2PinnedListCard {...p} />);
    fireEvent.click(screen.getByText('+2 more'));
    expect(p.onOpen).toHaveBeenCalled();
  });

  it('shows an empty state when nothing is open', () => {
    render(<WallV2PinnedListCard {...props([])} />);
    expect(screen.getByText(/nothing on this list/i)).toBeInTheDocument();
  });

  it('renders nothing in place of the empty state while the initial fetch is still in flight', () => {
    render(<WallV2PinnedListCard {...props([])} loading={true} />);
    expect(screen.queryByText(/nothing on this list/i)).not.toBeInTheDocument();
  });

  it('shows the empty state once loading resolves with no items', () => {
    render(<WallV2PinnedListCard {...props([])} loading={false} />);
    expect(screen.getByText(/nothing on this list/i)).toBeInTheDocument();
  });
});
