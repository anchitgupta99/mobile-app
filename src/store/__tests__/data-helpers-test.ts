import { callOutcomeLabel, describePatch, earliestCursor } from '../data';

describe('describePatch', () => {
  it('uses readable labels and words instead of raw keys and booleans', () => {
    expect(describePatch({ dnc: true })).toBe('Do not call: Yes');
    expect(describePatch({ name: 'Rohan', email: '' })).toBe('Name: Rohan · Email cleared');
    expect(describePatch({ tags: ['Hot lead', 'Renewal'] })).toBe('Tags: Hot lead, Renewal');
  });
});

describe('callOutcomeLabel', () => {
  it('titles an undispositioned call by what happened', () => {
    expect(callOutcomeLabel('missed')).toBe('Missed');
    expect(callOutcomeLabel('no-answer')).toBe('No answer');
    expect(callOutcomeLabel('failed')).toBe('Failed');
    expect(callOutcomeLabel('answered')).toBe('Not dispositioned');
  });
});

describe('earliestCursor', () => {
  it('takes the oldest server time so no list is skipped past', () => {
    expect(earliestCursor(['2026-11-02T10:00:02Z', '2026-11-02T10:00:00Z', null])).toBe('2026-11-02T10:00:00Z');
    expect(earliestCursor([null, undefined])).toBeNull();
  });
});
