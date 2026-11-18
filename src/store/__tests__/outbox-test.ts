import { api } from '@/api/client';
import type { Task } from '@/domain/types';
import { useOutbox } from '../outbox';

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

  it('shows nothing when marking a callback done fails, as the web has no such message', async () => {
    useOutbox.getState().enqueue({ kind: 'task', label: 'Callback', payload: callback({ done: true }) });
    await settle();
    expect(useOutbox.getState().failure).toBeNull();
  });
});
