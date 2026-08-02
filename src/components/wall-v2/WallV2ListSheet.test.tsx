import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2ListSheet } from './WallV2ListSheet';
import type { ListItem } from '@/types/list';

function item(id: string, text: string, completed = false): ListItem {
  return {
    id,
    listId: 'list-1',
    text,
    sortOrder: 0,
    completed,
    createdAt: new Date('2026-08-02T12:00:00Z'),
    updatedAt: new Date('2026-08-02T12:00:00Z'),
  };
}

const props = (items: ListItem[] = [item('1', 'Milk')]) => ({
  lists: [
    { id: 'list-1', title: 'Groceries', openCount: 1 },
    { id: 'list-2', title: 'Need now', openCount: 0 },
  ],
  selectedListId: 'list-1',
  onSelectList: vi.fn(),
  items,
  pinnedIds: ['list-1'],
  onTogglePin: vi.fn(),
  onAdd: vi.fn(),
  onToggle: vi.fn(),
  onEditText: vi.fn(),
  onDelete: vi.fn(),
  onClearDone: vi.fn(),
  onClose: vi.fn(),
});

describe('WallV2ListSheet', () => {
  it('adds an item and clears the field', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    const input = screen.getByPlaceholderText(/add to groceries/i);
    fireEvent.change(input, { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(p.onAdd).toHaveBeenCalledWith('Eggs');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('submits on Enter', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    const input = screen.getByPlaceholderText(/add to groceries/i);
    fireEvent.change(input, { target: { value: 'Eggs' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onAdd).toHaveBeenCalledWith('Eggs');
  });

  it('ignores an empty or whitespace-only add', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    const input = screen.getByPlaceholderText(/add to groceries/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(p.onAdd).not.toHaveBeenCalled();
  });

  it('tapping a row checks it off', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /check off milk/i }));
    expect(p.onToggle).toHaveBeenCalledWith('1', true);
  });

  it('edits item text through the row menu', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /more actions for milk/i }));
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const editInput = screen.getByDisplayValue('Milk');
    fireEvent.change(editInput, { target: { value: 'Whole milk' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(p.onEditText).toHaveBeenCalledWith('1', 'Whole milk');
  });

  it('deletes an item through the row menu', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /more actions for milk/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(p.onDelete).toHaveBeenCalledWith('1');
  });

  it('hides completed items until Done is expanded', () => {
    const p = props([item('1', 'Milk'), item('2', 'Bread', true)]);
    render(<WallV2ListSheet {...p} />);
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    expect(screen.getByText('Bread')).toBeInTheDocument();
  });

  it('unchecks a completed item', () => {
    const p = props([item('2', 'Bread', true)]);
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /uncheck bread/i }));
    expect(p.onToggle).toHaveBeenCalledWith('2', false);
  });

  it('requires two taps to clear done items', () => {
    const p = props([item('2', 'Bread', true)]);
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    const clear = screen.getByRole('button', { name: /clear done/i });
    fireEvent.click(clear);
    expect(p.onClearDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /tap again to confirm/i }));
    expect(p.onClearDone).toHaveBeenCalled();
  });

  it('switches lists and toggles pins from the rail', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /show need now/i }));
    expect(p.onSelectList).toHaveBeenCalledWith('list-2');
    fireEvent.click(screen.getByRole('button', { name: /unpin groceries/i }));
    expect(p.onTogglePin).toHaveBeenCalledWith('list-1');
  });

  it('closes on the close button', () => {
    const p = props();
    render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(p.onClose).toHaveBeenCalled();
  });

  it('closes a stale row menu when the list changes underneath it', () => {
    const p = props();
    const { rerender } = render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /more actions for milk/i }));
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();

    rerender(<WallV2ListSheet {...p} selectedListId="list-2" />);
    rerender(<WallV2ListSheet {...p} selectedListId="list-1" />);

    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('disarms the two-tap clear-done confirm when the list changes underneath it', () => {
    const p = props([item('2', 'Bread', true)]);
    const { rerender } = render(<WallV2ListSheet {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /clear done/i }));
    expect(screen.getByRole('button', { name: /tap again to confirm/i })).toBeInTheDocument();

    rerender(<WallV2ListSheet {...p} selectedListId="list-2" />);
    rerender(<WallV2ListSheet {...p} selectedListId="list-1" />);

    fireEvent.click(screen.getByRole('button', { name: /done \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /^clear done$/i }));
    expect(p.onClearDone).not.toHaveBeenCalled();
  });

  it('does not render count for lists with null openCount', () => {
    const p = props();
    p.lists = [
      { id: 'list-1', title: 'Groceries', openCount: 1 },
      { id: 'list-2', title: 'Need now', openCount: null },
    ];
    render(<WallV2ListSheet {...p} />);
    // Selected list should show its count
    expect(screen.getByText('1')).toBeInTheDocument();
    // Non-selected list with null count should show no number
    const needNowButton = screen.getByRole('button', { name: /show need now/i });
    expect(needNowButton.textContent).not.toMatch(/\d+/);
  });
});
