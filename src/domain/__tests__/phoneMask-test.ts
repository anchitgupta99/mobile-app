import { MASK_CHAR, maskPhoneForDisplay } from '../phoneMask';

const NUM = '9876543210';
const dots = (n: number) => MASK_CHAR.repeat(n);

describe('maskPhoneForDisplay', () => {
  it('shows the last digits for an end rule', () => {
    expect(maskPhoneForDisplay(NUM, { mask_type: 'end', unmask_count: 3 })).toBe(dots(7) + '210');
  });

  it('masks fully when the end rule unmasks nothing', () => {
    expect(maskPhoneForDisplay(NUM, { mask_type: 'end', unmask_count: 0 })).toBe(dots(10));
    expect(maskPhoneForDisplay(NUM, { mask_type: 'end' })).toBe(dots(10));
  });

  it('treats a non-numeric count as 0', () => {
    const rule = { mask_type: 'end', unmask_count: 'abc' as unknown as number };
    expect(maskPhoneForDisplay(NUM, rule)).toBe(dots(10));
    expect(maskPhoneForDisplay(NUM, { ...rule, mask_type: 'start' })).toBe(dots(10));
  });

  it('shows the first digits for a start rule', () => {
    expect(maskPhoneForDisplay(NUM, { mask_type: 'start', unmask_count: 2 })).toBe('98' + dots(8));
    expect(maskPhoneForDisplay(NUM, { mask_type: 'start', unmask_count: 0 })).toBe(dots(10));
  });
});
