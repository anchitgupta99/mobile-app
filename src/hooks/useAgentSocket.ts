import { useEffect } from 'react';
import { AppState } from 'react-native';
import { connectAgentEvents, disconnectAgentEvents } from '@/api/events';
import { USE_BACKEND } from '@/api/http';
import { connectAgentSocket, disconnectAgentSocket, wakeAgentSocket } from '@/api/socket';
import { notify } from '@/components/feedback';
import { useData } from '@/store/data';
import { SESSION_EXPIRED, useSession } from '@/store/session';
import { useCall } from '@/telephony/callStore';

/**
 * A "For Me" callback has come due, as the web's useCallbackAutoDial: the server only says so (and has already
 * marked it NOTIFIED), so the app places the call itself, in the agent's current campaign, as a CALLBACK call.
 * The web's own messages when the agent isn't READY or the call can't start. The Callbacks tab is then reloaded,
 * as the web reloads its list.
 */
async function dialDueCallback(phone: string) {
  const session = useSession.getState();
  if (session.status !== 'available') {
    notify('Switch to READY status', 'error', undefined, { title: 'Status Error' });
    return;
  }
  if (!session.agent?.campaignId) return;
  const res = await useCall.getState().startOutbound({ number: phone, source: 'task', callback: true });
  if (!res.ok) notify('Unable to start call', 'error', undefined, { title: 'Call Error' });
  void useData.getState().sync();
}

/**
 * Keeps the agent's live connections to the backend open while signed in: the socket (api/socket.ts) and the
 * event stream (api/events.ts), the two the web agent app keeps open too.
 */
export function useAgentSocket() {
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (!USE_BACKEND || !token) return;
    connectAgentSocket(token, {
      forcedLogout: (message) => useSession.getState().logout(message, { serverEnded: true }),
      sessionExpired: () => useSession.getState().logout(SESSION_EXPIRED, { serverEnded: true }),
      // The server's view wins, as on the web: a break set elsewhere, or PAUSED after a dropped connection.
      // INCALL / DISPO / RINGING belong to the call itself and leave the status pill alone.
      sessionUpdate: ({ status, activeBreak }) => {
        const s = useSession.getState();
        if (!s.live) return;
        if (activeBreak?.break_type_id) s.setStatus('break', { remote: true, breakCode: activeBreak.break_type_id });
        else if (status === 'READY') s.setStatus('available', { remote: true });
        else if (status === 'PAUSED' || status === 'BREAK') s.setStatus('offline', { remote: true });
      },
      inboundIncoming: (data) => useCall.getState().inboundIncoming(data),
      inboundEnded: (data) => useCall.getState().inboundEnded(data),
      callbackDue: ({ callback }) => {
        if (callback?.phone_number) void dialDueCallback(callback.phone_number);
      },
    });
    // Why a call failed, as the web's "Call Failed" toast, and its "Callback Reminder" (hooks/useCallEvents.ts)
    connectAgentEvents(token, {
      callFailure: (message) => notify(message, 'error', undefined, { title: 'Call Failed' }),
      callbackReminder: (message) => notify(message, 'info', undefined, { title: 'Callback Reminder' }),
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') wakeAgentSocket();
    });
    return () => {
      sub.remove();
      disconnectAgentSocket();
      disconnectAgentEvents();
    };
  }, [token]);
}
