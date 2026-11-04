import { api } from '@/api/client';
import type { CallAdapter } from './adapter';

export const bridgeAdapter: CallAdapter = {
  mode: 'bridge',
  async dial({ number, contactId }) {
    const res = await api.calls.start({ number, contactId, mode: 'bridge', resolvedMode: 'bridge' });
    return { callId: res.callId };
  },
  async answer() {},
  async hold(callId, on) {
    await api.calls.control(callId, on ? 'hold' : 'unhold');
  },
  async mute(callId, on) {
    await api.calls.control(callId, on ? 'mute' : 'unmute');
  },
  async dtmf(callId, digit) {
    await api.calls.control(callId, 'dtmf', digit);
  },
  async end(callId) {
    await api.calls.control(callId, 'end').catch(() => undefined);
  },
};
