import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import { useSession } from '@/store/session';
import type { CallAdapter } from './adapter';
import { hangupSip, sendSipDtmf, setSipMuted } from './sip/sipPhone';

/**
 * Calls over the app's webphone, like the web agent app: the server dials the customer and rings the webphone
 * (see sip/sipPhone.ts), hold goes through the server, and mute, keypad and hang-up act on the webphone's own call.
 */
export const voipAdapter: CallAdapter = {
  mode: 'voip',
  async dial({ number, callback }) {
    const campaignId = useSession.getState().agent?.campaignId;
    if (!campaignId) throw new ApiError('validation', 'No active campaign. Pick one from the menu first.');
    // The server's call UUID (shown on the call screen, used for hold and the disposition), its lead and campaign
    const res = await api.liveCalls.manual(number, campaignId, callback ? 'CALLBACK' : 'MANUAL');
    return { callId: res.callUuid, leadId: res.leadId, campaignId: res.campaignId };
  },
  async answer() {},
  async hold(callUuid, on) {
    await api.liveCalls.hold(callUuid, on);
  },
  async mute(_callId, on) {
    return setSipMuted(on);
  },
  async dtmf(_callId, digit) {
    return sendSipDtmf(digit);
  },
  async end() {
    return hangupSip();
  },
};
