import { useNetwork } from '@/api/network';
import { ApiError } from '@/api/client';
import { MAX_ATTEMPTS, useOutbox } from '../outbox';

jest.mock('@/api/client', () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  const reject = () => Promise.reject(new ApiError('validation', 'Contact not found'));
  return {
    ApiError,
    api: {
      contacts: { update: jest.fn(reject) },
      calls: { disposition: jest.fn(), upsert: jest.fn() },
      tasks: { upsert: jest.fn() },
      agents: { setStatus: jest.fn() },
    },
  };
});

beforeEach(() => {
  useNetwork.setState({ quality: 'good' });
  useOutbox.setState({ items: [], syncing: false, lastError: null });
});

describe('rejected items', () => {
  it('are parked after the retry limit instead of looping forever', async () => {
    useOutbox.getState().enqueue({ kind: 'contact', label: 'Edit', payload: { id: 'ct_x', patch: {} } });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await useOutbox.getState().flush();
    const [item] = useOutbox.getState().items;
    expect(item.parked).toBe(true);
    expect(item.attempts).toBe(MAX_ATTEMPTS);
    expect(item.error).toBe('Contact not found');
    expect(ApiError).toBeDefined();
  });

  it('can be discarded or put back in the queue', async () => {
    useOutbox.getState().enqueue({ kind: 'contact', label: 'Edit', payload: { id: 'ct_x', patch: {} } });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await useOutbox.getState().flush();
    const key = useOutbox.getState().items[0].key;
    useOutbox.getState().retry(key);
    expect(useOutbox.getState().items[0].parked).toBe(false);
    useOutbox.getState().discard(key);
    expect(useOutbox.getState().items).toHaveLength(0);
  });
});
