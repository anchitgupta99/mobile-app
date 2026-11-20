import type { CallRecord } from '@/domain/types';
import { callOutcomeLabel, describePatch, earliestCursor, withServerCalls } from '../data';

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

describe('withServerCalls', () => {
  const row = (p: Partial<CallRecord>): CallRecord => ({
    id: 'u1',
    uuid: 'u1',
    contactId: null,
    number: '9800000000',
    direction: 'outbound',
    outcome: 'answered',
    mode: 'voip',
    startedAt: new Date().toISOString(),
    durationSec: 10,
    disposition: null,
    notes: '',
    hasRecording: false,
    campaignId: 'c1',
    updatedAt: new Date().toISOString(),
    ...p,
  });
  const mine = row({ id: 'local1', listId: 'L1', campaignPrefix: 'P', leadId: 'lead1', customerName: 'Asha', displayNumber: '98XXXX0000' });

  it('keeps the call context the server row lacks', () => {
    const [merged] = withServerCalls([mine], [row({ leadId: null, disposition: 'Sale' })], new Set());
    expect(merged).toMatchObject({ id: 'local1', disposition: 'Sale', listId: 'L1', campaignPrefix: 'P', leadId: 'lead1', customerName: 'Asha', displayNumber: '98XXXX0000' });
  });

  it('leaves the call in wrap-up as it is', () => {
    const [merged] = withServerCalls([mine], [row({ disposition: 'Sale' })], new Set(), 'local1');
    expect(merged).toBe(mine);
  });
});
