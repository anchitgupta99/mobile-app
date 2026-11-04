import { formatRelative } from '../format';

const NOW = new Date('2026-11-02T12:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60000).toISOString();

describe('formatRelative', () => {
  it('never says "60 min" or "24 h"', () => {
    expect(formatRelative(at(59), NOW)).toBe('in 59 min');
    expect(formatRelative(at(60), NOW)).toBe('in 1 h');
    expect(formatRelative(at(-1439), NOW)).toBe('1 d ago');
    expect(formatRelative(at(1410), NOW)).toBe('in 1 d');
    expect(formatRelative(at(1380), NOW)).toBe('in 23 h');
  });

  it('handles the near-zero and far cases', () => {
    expect(formatRelative(at(0), NOW)).toBe('now');
    expect(formatRelative(at(-3 * 1440), NOW)).toBe('3 d ago');
  });
});
