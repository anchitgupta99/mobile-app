import type { Disposition } from './types';

/** A chosen route through the disposition tree, top-level outcome first */
export type DispositionPath = Disposition[];

export function pathLabel(path: DispositionPath) {
  return path.map((d) => d.label).join(' › ');
}

/** Outcomes that mean "try again later": the callback that led to the call stays open */
const RETRY_CODES = new Set(['no_answer', 'busy']);

export function isRetryDisposition(code: string) {
  return RETRY_CODES.has(code);
}

export function isComplete(path: DispositionPath) {
  const last = path[path.length - 1];
  return !!last && !last.children?.length;
}

/** Every node in the tree with the path that reaches it, depth first */
export function allPaths(tree: Disposition[], prefix: DispositionPath = []): DispositionPath[] {
  return tree.flatMap((d) => {
    const p = [...prefix, d];
    return [p, ...allPaths(d.children ?? [], p)];
  });
}

/**
 * Finds the path for a saved value, which may be a code, a node label or a full path label.
 * Leaves are preferred; a value that only matches a parent (older records saved the top-level outcome)
 * resolves to that partial path so it still gets a label and tone.
 */
export function findPath(tree: Disposition[], saved: string | null | undefined): DispositionPath | null {
  if (!saved) return null;
  const paths = allPaths(tree);
  const matches = (p: DispositionPath) => {
    const last = p[p.length - 1];
    return last.code === saved || pathLabel(p) === saved || last.label === saved;
  };
  return paths.find((p) => isComplete(p) && matches(p)) ?? paths.find(matches) ?? null;
}
