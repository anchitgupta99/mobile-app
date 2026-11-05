import { useEffect } from 'react';
import { AppState } from 'react-native';
import { connectAgentEvents, disconnectAgentEvents } from '@/api/events';
import { USE_BACKEND } from '@/api/http';
import { connectAgentSocket, disconnectAgentSocket, wakeAgentSocket } from '@/api/socket';
import { notify } from '@/components/feedback';
import { SESSION_EXPIRED, useSession } from '@/store/session';
import { useCall } from '@/telephony/callStore';

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
    });
    // Why a call failed, as the web's "Call Failed" toast (hooks/useCallEvents.ts)
    connectAgentEvents(token, {
      callFailure: (message) => notify(message, 'error', undefined, { title: 'Call Failed' }),
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
