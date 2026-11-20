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

describe('sync while one is running', () => {
  it('runs once more after it, instead of dropping the later ask', async () => {
    let finish!: () => void;
    list.mockReturnValueOnce(new Promise((r) => (finish = () => r({ listStatus: 'assigned', items: [], cursor: null }))));
    list.mockReturnValueOnce(ok([contact('b')]));
    const first = useData.getState().sync();
    const second = useData.getState().sync();
    const third = useData.getState().sync();
    finish();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    await third;
    expect(list).toHaveBeenCalledTimes(2);
    expect(useData.getState().contacts.map((c) => c.id)).toEqual(['b']);
  });

  it("doesn't apply dispositions fetched for a campaign switched away from meanwhile", async () => {
    let finish!: () => void;
    list.mockReturnValueOnce(new Promise((r) => (finish = () => r({ listStatus: 'assigned', items: [], cursor: null }))));
    const config = api.dispositions.config as jest.Mock;
    config.mockImplementationOnce((campaignId: string) =>
      Promise.resolve({ campaignId, mandatory: true, acwSeconds: 30, dispositions: [] }),
    );
    useData.setState((s) => ({ dispositions: { ...s.dispositions, campaignId: 'old' } }));
    const first = useData.getState().sync();
    useData.setState((s) => ({ dispositions: { ...s.dispositions, campaignId: 'new' } }));
    finish();
    await first;
    expect(useData.getState().dispositions.campaignId).toBe('new');
  });

  it('a sync cut short by a logout leaves the wiped store alone', async () => {
    let fail!: () => void;
    list.mockReturnValueOnce(new Promise((_, rej) => (fail = () => rej(new Error('Network down')))));
    const first = useData.getState().sync();
    useData.getState().wipe();
    expect(useData.getState().refreshing).toBe(false);
    fail();
    await first;
    expect(useData.getState().syncError).toBeNull();
  });
});
