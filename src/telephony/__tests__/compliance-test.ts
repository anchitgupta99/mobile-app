import { checkBeforeDial, localHour } from '../compliance';

describe('localHour', () => {
  it('reports midnight as 0, not 24', () => {
    // 18:30 UTC is 00:00 in Kolkata
    expect(localHour(new Date('2026-11-02T18:30:00Z'), 'Asia/Kolkata')).toBe(0);
  });

  it('falls back to the default zone instead of throwing on an invalid one', () => {
    expect(() => localHour(new Date(), 'Mars/Olympus')).not.toThrow();
    expect(localHour(new Date('2026-11-02T04:30:00Z'), 'Mars/Olympus')).toBe(10);
  });
});

describe('checkBeforeDial', () => {
  it('does not reject on a bad contact time zone', () => {
    const contact = { name: 'X', dnc: false, timezone: 'Not/AZone' } as never;
    expect(checkBeforeDial(contact, true, new Date('2026-11-02T06:00:00Z')).ok).toBe(true);
  });
});
