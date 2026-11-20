import { categoryOf, detailError, detailProgress, isCaptured, missingRequired, type DetailEntry } from '../details';
import type { CaptureField, Disposition } from '../types';

const field = (p: Partial<CaptureField> & Pick<CaptureField, 'key' | 'type'>): CaptureField => ({
  label: p.key,
  required: false,
  order: 0,
  allowDeclined: true,
  ...p,
});
const entry = (p: Partial<DetailEntry> = {}): DetailEntry => ({
  value: '',
  prefilled: false,
  confirmed: false,
  declined: false,
  save: 'idle',
  ...p,
});

const name = field({ key: 'name', type: 'text', required: true });
const email = field({ key: 'email', type: 'email', required: true });
const city = field({ key: 'city', type: 'dropdown', options: ['Pune', 'Delhi'] });

describe('detailError', () => {
  it('checks email format on the spot', () => {
    expect(detailError(email, 'rahul@')).toMatch(/valid email/);
    expect(detailError(email, 'rahul@example.com')).toBeNull();
  });
  it('checks phone digits', () => {
    expect(detailError(field({ key: 'alt', type: 'phone' }), '12')).toMatch(/phone/);
    expect(detailError(field({ key: 'alt', type: 'phone' }), '+91 98765 43210')).toBeNull();
  });
  it('only accepts listed options', () => {
    expect(detailError(city, 'Goa')).not.toBeNull();
    expect(detailError(city, 'Pune')).toBeNull();
  });
  it("doesn't flag an empty value", () => {
    expect(detailError(email, '')).toBeNull();
  });
});

describe('isCaptured', () => {
  it('needs a CRM value to be confirmed first', () => {
    expect(isCaptured(name, entry({ value: 'Rahul', prefilled: true }))).toBe(false);
    expect(isCaptured(name, entry({ value: 'Rahul', prefilled: true, confirmed: true }))).toBe(true);
  });
  it('counts declined as captured', () => {
    expect(isCaptured(email, entry({ declined: true }))).toBe(true);
  });
  it("doesn't count an invalid value", () => {
    expect(isCaptured(email, entry({ value: 'nope', confirmed: true }))).toBe(false);
  });
});

describe('progress and missing', () => {
  const entries = { name: entry({ value: 'Rahul', confirmed: true }), email: entry(), city: entry() };
  it('counts required fields only: 1 of 2', () => {
    expect(detailProgress([name, email, city], entries)).toEqual({ captured: 1, total: 2, requiredOnly: true });
  });
  it('lists the missing required ones', () => {
    expect(missingRequired([name, email, city], entries).map((f) => f.key)).toEqual(['email']);
  });
});

describe('categoryOf', () => {
  const leaf: Disposition = { code: 'b', label: 'Interested', fields: [] };
  const top: Disposition = { code: 'a', label: 'Connected', fields: [], category: 'connected', children: [leaf] };
  it("inherits the parent's category", () => {
    expect(categoryOf([top, leaf])).toBe('connected');
  });
  it('is undefined when none is set', () => {
    expect(categoryOf([leaf])).toBeUndefined();
  });
});
