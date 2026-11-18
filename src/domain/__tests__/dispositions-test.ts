import type { Disposition } from '../types';
import { findPath, isComplete, pathLabel } from '../dispositions';

// A small tree shaped like a campaign's: outcomes, sub-dispositions under some, and the same label at two levels
const tree: Disposition[] = [
  {
    code: 'interested',
    label: 'Interested',
    fields: [],
    children: [
      { code: 'int_quote', label: 'Wants a quote', fields: [] },
      { code: 'int_docs', label: 'Sent document list', fields: [] },
    ],
  },
  { code: 'not_interested', label: 'Not interested', fields: [], children: [{ code: 'ni_rate', label: 'Rate too high', fields: [] }] },
  // "No answer" is both an outcome on its own and a group with sub-dispositions
  { code: 'no_answer_group', label: 'No answer', fields: [], children: [{ code: 'na_retry', label: 'Retry later', fields: [] }] },
  { code: 'no_answer', label: 'No answer', fields: [] },
];

describe('findPath', () => {
  it('resolves a leaf by code, label or full path label', () => {
    expect(pathLabel(findPath(tree, 'int_quote')!)).toBe('Interested › Wants a quote');
    expect(pathLabel(findPath(tree, 'Wants a quote')!)).toBe('Interested › Wants a quote');
    expect(pathLabel(findPath(tree, 'Interested › Wants a quote')!)).toBe('Interested › Wants a quote');
  });

  it('resolves a top-level outcome saved by older records to a partial path', () => {
    const p = findPath(tree, 'Interested');
    expect(p).not.toBeNull();
    expect(p!.map((d) => d.code)).toEqual(['interested']);
    expect(isComplete(p!)).toBe(false);
    expect(findPath(tree, 'Not interested')?.[0].code).toBe('not_interested');
  });

  it('prefers a leaf when a label matches both', () => {
    expect(findPath(tree, 'No answer')!.map((d) => d.code)).toEqual(['no_answer']);
  });

  it('returns null for unknown or empty values', () => {
    expect(findPath(tree, 'Nope')).toBeNull();
    expect(findPath(tree, null)).toBeNull();
  });
});
