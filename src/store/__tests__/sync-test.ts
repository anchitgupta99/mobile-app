import { mergeById } from '../data';
import { pendingIds, type OutboxItem } from '../outbox';

type Row = { id: string; updatedAt: string; v: string };
const row = (id: string, updatedAt: string, v: string): Row => ({ id, updatedAt, v });

describe('mergeById', () => {
  it('lets the newer server row win when nothing is queued', () => {
    const out = mergeById([row('a', '2026-01-01T00:00:00Z', 'local')], [row('a', '2026-01-02T00:00:00Z', 'server')]);
    expect(out).toEqual([row('a', '2026-01-02T00:00:00Z', 'server')]);
  });

  it('keeps the local row while a change for it is still in the outbox', () => {
    const out = mergeById(
      [row('a', '2026-01-01T00:00:00Z', 'local')],
      [row('a', '2026-01-02T00:00:00Z', 'server')],
      new Set(['a']),
    );
    expect(out).toEqual([row('a', '2026-01-01T00:00:00Z', 'local')]);
  });

  it('still adds rows the device has never seen even if their id is pending', () => {
    const out = mergeById([], [row('a', '2026-01-02T00:00:00Z', 'server')], new Set(['a']));
    expect(out).toEqual([row('a', '2026-01-02T00:00:00Z', 'server')]);
  });
});

describe('pendingIds', () => {
  it('maps every queued item to the record it changes, ignoring status', () => {
    const items = [
      { key: 'k1', kind: 'task', label: '', attempts: 0, createdAt: '', payload: { id: 'tk_1' } },
      { key: 'k2', kind: 'contact', label: '', attempts: 0, createdAt: '', payload: { id: 'ct_1', patch: {} } },
      { key: 'k3', kind: 'status', label: '', attempts: 0, createdAt: '', payload: { status: 'available', breakCode: null } },
    ] as OutboxItem[];
    expect([...pendingIds(items)].sort()).toEqual(['ct_1', 'tk_1']);
  });
});
