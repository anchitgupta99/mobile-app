import { api } from '@/api/client';
import type { Task } from '@/domain/types';
import { pendingIds, useOutbox } from '../outbox';

jest.mock('@/api/client', () => ({
  api: {
    contacts: { update: jest.fn(() => Promise.resolve({})) },
    tasks: { upsert: jest.fn(() => Promise.reject(new Error('Network down'))) },
    agents: { setStatus: jest.fn(() => Promise.resolve({})) },
  },
}));

const callback = (patch: Partial<Task> = {}): Task => ({
  id: '00000000-0000-4000-8000-000000000003',
  kind: 'callback',
  title: 'Callback',
  contactId: null,
  number: '9800000000',
  dueAt: new Date().toISOString(),
  slaDueAt: null,
  notes: '',
  done: false,
  createdFromCallId: null,
  updatedAt: new Date().toISOString(),
  ...patch,
});

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  useOutbox.setState({ items: [], syncing: false, lastError: null, failure: null });
});

// As the web, which has no queue: each change goes to the server once, straight away
describe('a change', () => {
  it('is sent once and never queued', async () => {
    useOutbox.getState().enqueue({ kind: 'status', label: 'Status', payload: { status: 'available', breakCode: null } });
    await settle();
    expect(api.agents.setStatus).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().items).toHaveLength(0);
  });

  it("shows the web's message when a callback reschedule fails", async () => {
    useOutbox.getState().enqueue({ kind: 'task', label: 'Callback', payload: callback() });
    await settle();
    expect(api.tasks.upsert).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().failure?.message).toBe('Failed to reschedule. Please try again.');
  });

  it('shows an error and calls onFail when marking a callback done fails', async () => {
    const onFail = jest.fn();
    useOutbox.getState().enqueue({ kind: 'task', label: 'Callback', payload: callback({ done: true }) }, { onFail });
    await settle();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().failure?.message).toBe("Couldn't mark the callback done. Please try again.");
  });

  it('counts a change being sent as pending, until it settles', async () => {
    useOutbox.getState().enqueue({ kind: 'task', label: 'Callback', payload: callback() });
    expect(pendingIds([]).has(callback().id)).toBe(true);
    await settle();
    expect(pendingIds([]).has(callback().id)).toBe(false);
  });

  it('sends status changes one at a time, in order', async () => {
    const order: string[] = [];
    let release!: () => void;
    (api.agents.setStatus as jest.Mock)
      .mockImplementationOnce((s: string) => {
        order.push(`start ${s}`);
        return new Promise<void>((r) => (release = () => (order.push(`end ${s}`), r())));
      })
      .mockImplementationOnce((s: string) => (order.push(`start ${s}`), Promise.resolve({})));
    useOutbox.getState().enqueue({ kind: 'status', label: 'Status', payload: { status: 'break', breakCode: 'b' } });
    useOutbox.getState().enqueue({ kind: 'status', label: 'Status', payload: { status: 'available', breakCode: null } });
    await settle();
    expect(order).toEqual(['start break']);
    release();
    await settle();
    expect(order).toEqual(['start break', 'end break', 'start available']);
  });
});
