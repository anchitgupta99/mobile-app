import { api } from '@/api/client';
import type { Contact } from '@/domain/types';
import { useData } from '../data';

jest.mock('@/api/client', () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    ApiError,
    api: {
      contacts: { list: jest.fn() },
      calls: { list: jest.fn(() => Promise.resolve({ items: [], cursor: null })) },
      tasks: { list: jest.fn(() => Promise.resolve({ items: [], cursor: null })) },
      dispositions: {
        config: jest.fn(() => Promise.resolve({ campaignId: '', mandatory: true, acwSeconds: 30, dispositions: [] })),
      },
      config: { get: jest.fn(() => Promise.resolve({ breakTypes: [] })) },
      timeline: { seed: jest.fn(() => []) },
    },
  };
});

const list = api.contacts.list as jest.Mock;

const contact = (id: string): Contact =>
  ({ id, name: id, company: '', phone: '9800000000', tags: [], dnc: false, updatedAt: '2026-01-01T00:00:00Z' }) as unknown as Contact;

const ok = (items: Contact[], listStatus = 'assigned', listName?: string) =>
  Promise.resolve({ listStatus, listName, items, cursor: '2026-01-02T00:00:00Z' });

beforeEach(() => {
  jest.clearAllMocks();
  useData.getState().wipe();
  useData.setState({ refreshing: false, syncError: null });
});

describe('contacts sync', () => {
  it('records the error on a later failed sync too, keeping the cached rows', async () => {
    list.mockReturnValueOnce(ok([contact('a')], 'assigned', 'Q4 leads'));
    expect(await useData.getState().sync()).toBe(true);
    expect(useData.getState().contactsListName).toBe('Q4 leads');

    list.mockReturnValueOnce(Promise.reject(new Error('Network down')));
    expect(await useData.getState().sync()).toBe(false);
    expect(useData.getState().contactsError).toBe('Network down');
    expect(useData.getState().contacts).toHaveLength(1);
  });

  it('clears the error once the contacts load again', async () => {
    list.mockReturnValueOnce(Promise.reject(new Error('Network down')));
    await useData.getState().sync();
    expect(useData.getState().contactsError).toBe('Network down');

    list.mockReturnValueOnce(ok([contact('a')]));
    await useData.getState().sync();
    expect(useData.getState().contactsError).toBeNull();
  });

  it("stores the list status and drops cached rows when there's no list", async () => {
    list.mockReturnValueOnce(ok([contact('a')]));
    await useData.getState().sync();
    list.mockReturnValueOnce(ok([], 'none'));
    await useData.getState().sync();
    expect(useData.getState().contactsListStatus).toBe('none');
    expect(useData.getState().contacts).toHaveLength(0);
  });
});
