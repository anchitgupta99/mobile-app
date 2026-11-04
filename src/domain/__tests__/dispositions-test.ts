import { dispositionConfig } from '@/mocks/seed';
import { findPath, isComplete, pathLabel } from '../dispositions';

const tree = dispositionConfig.dispositions;

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
