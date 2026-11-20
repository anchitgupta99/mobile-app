// A server address, so requests go to fetch rather than the demo answers
process.env.EXPO_PUBLIC_API_URL = 'http://server.test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mobileRequest, TIMED_OUT } = require('../http') as typeof import('../http');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

describe('mobileRequest with no answer', () => {
  it("is 'offline' when the request never reaches the server", async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    await expect(mobileRequest('POST', '/x', {})).rejects.toMatchObject({ code: 'offline', reason: undefined });
  });

  it('times a change out after 20 s, with reason TIMED_OUT', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('Aborted')))),
    ) as unknown as typeof fetch;
    const req = mobileRequest('PUT', '/x', {});
    const result = expect(req).rejects.toMatchObject({ code: 'offline', reason: TIMED_OUT });
    jest.advanceTimersByTime(19999);
    jest.advanceTimersByTime(1);
    await result;
  });
});
