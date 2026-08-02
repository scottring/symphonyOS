import { describe, it, expect } from 'vitest';
import { shouldPollLists } from './WallV2PinnedList';

describe('shouldPollLists', () => {
  it('polls when the tab is visible and it is not quiet hours', () => {
    expect(shouldPollLists(false, false)).toBe(true);
  });

  it('skips when the tab is hidden — a backgrounded tab costs egress for nothing', () => {
    expect(shouldPollLists(true, false)).toBe(false);
  });

  it('skips during quiet hours — nobody is reading the wall at 3am', () => {
    expect(shouldPollLists(false, true)).toBe(false);
  });

  it('skips when both are true', () => {
    expect(shouldPollLists(true, true)).toBe(false);
  });
});
