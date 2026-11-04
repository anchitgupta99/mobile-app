import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import { USE_BACKEND } from '@/api/http';
import { useSession } from '@/store/session';
import type { CallAdapter } from './adapter';
import { hangupSip, sendSipDtmf, setSipMuted } from './sip/sipPhone';

/**
 * Calls over the app's webphone. Against the backend it works like the web agent app: the server dials
 * the customer and rings the webphone (see sip/sipPhone.ts), hold goes through the server, and mute,
 * keypad and hang-up act on the webphone's own call. Without the backend it drives the mock API.
 */
export const voipAdapter: CallAdapter = {
  mode: 'voip',
  async dial({ number, contactId }) {
    if (USE_BACKEND) {
      const campaignId = useSession.getState().agent?.campaignId;
      if (!campaignId) throw new ApiError('validation', 'No active campaign. Pick one from the menu first.');
      // The server's call UUID (shown on the call screen, used for hold and the disposition), its lead and campaign
      const res = await api.liveCalls.manual(number, campaignId);
      return { callId: res.callUuid, leadId: res.leadId, campaignId: res.campaignId };
    }
    const res = await api.calls.start({ number, contactId, mode: 'voip', resolvedMode: 'voip' });
    return { callId: res.callId };
  },
  async answer() {},
  async hold(callUuid, on) {
    if (USE_BACKEND) {
      await api.liveCalls.hold(callUuid, on);
      return;
    }
    await api.calls.control(callUuid, on ? 'hold' : 'unhold');
  },
  async mute(callId, on) {
    if (USE_BACKEND) return setSipMuted(on);
    await api.calls.control(callId, on ? 'mute' : 'unmute');
  },
  async dtmf(callId, digit) {
    if (USE_BACKEND) return sendSipDtmf(digit);
    await api.calls.control(callId, 'dtmf', digit);
  },
  async end(callId) {
    if (USE_BACKEND) return hangupSip();
    await api.calls.control(callId, 'end').catch(() => undefined);
  },
};
