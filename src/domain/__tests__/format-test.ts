import { formatDialed, formatRelative, snoozeMinutesTo, tomorrowAt } from '../format';

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

describe('formatDialed', () => {
  it('groups only complete numbers', () => {
    expect(formatDialed('9876543210')).toBe('98765 43210');
    expect(formatDialed('+919876543210')).toBe('+91 98765 43210');
  });

  it('shows anything else exactly as typed', () => {
    expect(formatDialed('+9198765432101')).toBe('+9198765432101');
    expect(formatDialed('98765*43210')).toBe('98765*43210');
    expect(formatDialed('*123#')).toBe('*123#');
    expect(formatDialed('98765432101')).toBe('98765432101');
    expect(formatDialed('+91987')).toBe('+91987');
    expect(formatDialed('')).toBe('');
  });
});

describe('Tomorrow snooze', () => {
  const now = new Date(2026, 10, 2, 15, 30); // local 2 Nov, 3:30 pm
  const target = tomorrowAt(9, now);

  it('targets 9:00 tomorrow in local time', () => {
    expect([target.getDate(), target.getHours(), target.getMinutes()]).toEqual([3, 9, 0]);
  });

  it('lands on the target whether the task is overdue or due later', () => {
    const land = (dueAt: Date) => {
      const base = Math.max(now.getTime(), dueAt.getTime());
      return new Date(base + snoozeMinutesTo(target, dueAt.toISOString(), now.getTime()) * 60000);
    };
    expect(land(new Date(2026, 10, 2, 10, 0))).toEqual(target); // overdue
    expect(land(new Date(2026, 10, 2, 22, 0))).toEqual(target); // due tonight, not 22:00 tomorrow
  });
});
